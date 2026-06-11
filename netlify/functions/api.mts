import type { Config, Context } from "@netlify/functions"
import { createRemoteJWKSet, jwtVerify } from "jose"

import {
  commitFile,
  getFile,
  installationForRepo,
  listInstallations,
  listMarkdownTree,
  openPullRequest,
  userInstallationIds,
} from "./lib/github.ts"
import { getLinkedInstallations, linkInstallations } from "./lib/user-links.ts"

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  })

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || "webreplay.us.auth0.com"
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID
const AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET
const COOKIE = "auth_token"
// AUTH_DISABLED lets the API run open until the Auth0 .env is provisioned.
const AUTH_DISABLED = process.env.AUTH_DISABLED === "true"

const jwks = createRemoteJWKSet(
  new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`)
)

function bearerOrCookieToken(req: Request): string | null {
  const header = req.headers.get("authorization") || ""
  if (header.startsWith("Bearer ")) return header.slice(7)
  const cookies = req.headers.get("cookie") || ""
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))
  return match ? match[1] : null
}

async function verifyToken(token: string) {
  return jwtVerify(token, jwks, {
    issuer: `https://${AUTH0_DOMAIN}/`,
    ...(AUTH0_AUDIENCE ? { audience: AUTH0_AUDIENCE } : {}),
  })
}

// Auth0 Regular Web App flow: the SPA lands back on the site root with
// ?code=... and forwards it here; the secret-bearing exchange stays
// server-side and the session lives in an HttpOnly cookie.
async function handleAuth(req: Request, path: string): Promise<Response> {
  const sub = path.replace(/^\/auth/, "") || "/"

  if (sub === "/exchange" && req.method === "POST") {
    if (!AUTH0_CLIENT_ID || !AUTH0_CLIENT_SECRET) {
      return json({ error: "auth not configured" }, 500)
    }
    const { code, redirect_uri } = (await req.json()) as {
      code?: string
      redirect_uri?: string
    }
    if (!code || !redirect_uri) {
      return json({ error: "code and redirect_uri required" }, 400)
    }
    const res = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: AUTH0_CLIENT_ID,
        client_secret: AUTH0_CLIENT_SECRET,
        code,
        redirect_uri,
      }),
    })
    if (!res.ok) {
      return json({ error: "token exchange failed", detail: await res.text() }, 401)
    }
    const { access_token, expires_in } = (await res.json()) as {
      access_token: string
      expires_in: number
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": `${COOKIE}=${access_token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${expires_in ?? 86400}`,
      },
    })
  }

  if (sub === "/me" && req.method === "GET") {
    const token = bearerOrCookieToken(req)
    if (!token) return json({ error: "not authenticated" }, 401)
    try {
      const { payload } = await verifyToken(token)
      return json({ sub: payload.sub, exp: payload.exp })
    } catch {
      return json({ error: "invalid session" }, 401)
    }
  }

  if (sub === "/logout" && req.method === "POST") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
      },
    })
  }

  return json({ error: "not found", path }, 404)
}

/** Auth0 user id (sub) of the current session, or null. */
async function sessionSub(req: Request): Promise<string | null> {
  const token = bearerOrCookieToken(req)
  if (!token) return null
  try {
    const { payload } = await verifyToken(token)
    return String(payload.sub)
  } catch {
    return null
  }
}

async function authenticate(req: Request): Promise<Response | null> {
  if (AUTH_DISABLED) return null
  const token = bearerOrCookieToken(req)
  if (!token) return json({ error: "missing bearer token" }, 401)
  try {
    await verifyToken(token)
    return null
  } catch {
    return json({ error: "invalid token" }, 401)
  }
}

async function handleGithub(req: Request, path: string): Promise<Response> {
  const sub = path.replace(/^\/github/, "") || "/"

  // GitHub redirects here after an app install / OAuth authorization
  // (?code=…&installation_id=…&setup_action=install). Exchange the code
  // server-side, then drop the user back into the app.
  if (sub === "/callback" && req.method === "GET") {
    const url = new URL(req.url)
    const code = url.searchParams.get("code")
    // The GitHub connection is bound to the logged-in Auth0 user: the OAuth
    // code identifies the GitHub user, whose installations get linked to the
    // Auth0 sub. Without a session there is nothing to link to.
    const userSub = await sessionSub(req)
    let outcome = "error"
    if (!userSub) {
      outcome = "login-required"
    } else if (code && process.env.GITHUB_APP_CLIENT_ID && process.env.GITHUB_APP_CLIENT_SECRET) {
      try {
        const res = await fetch("https://github.com/login/oauth/access_token", {
          method: "POST",
          headers: { accept: "application/json", "content-type": "application/json" },
          body: JSON.stringify({
            client_id: process.env.GITHUB_APP_CLIENT_ID,
            client_secret: process.env.GITHUB_APP_CLIENT_SECRET,
            code,
          }),
        })
        const body = (await res.json()) as { access_token?: string }
        if (body.access_token) {
          const ids = await userInstallationIds(body.access_token)
          await linkInstallations(userSub, ids)
          outcome = "connected"
        }
      } catch (e) {
        console.error("github callback link failed:", e)
      }
    }
    return new Response(null, {
      status: 302,
      headers: { location: `/?github=${outcome}` },
    })
  }

  // GitHub posts push/PR events here (configured on the GitHub App).
  if (sub === "/webhook" && req.method === "POST") {
    const event = req.headers.get("x-github-event") ?? "unknown"
    console.log(`github webhook: ${event}`)
    return json({ ok: true })
  }

  // /github/repos/:owner/:repo/(tree|file|save)
  const repoMatch = sub.match(/^\/repos\/([^/]+)\/([^/]+)\/(tree|file|save)$/)
  if (repoMatch) {
    const fullName = `${repoMatch[1]}/${repoMatch[2]}`
    const action = repoMatch[3]
    try {
      // The repo must belong to an installation this user connected.
      const userSub = await sessionSub(req)
      const linked = userSub ? await getLinkedInstallations(userSub) : []
      if (!linked.includes(await installationForRepo(fullName))) {
        return json({ error: "repository not connected to this account" }, 403)
      }
      if (action === "tree" && req.method === "GET") {
        return json(await listMarkdownTree(fullName))
      }
      if (action === "file" && req.method === "GET") {
        const url = new URL(req.url)
        const filePath = url.searchParams.get("path")
        if (!filePath) return json({ error: "path required" }, 400)
        return json(await getFile(fullName, filePath))
      }
      if (action === "save" && req.method === "POST") {
        const body = (await req.json()) as {
          path?: string
          content?: string
          message?: string
          mode?: "main" | "pr"
          sha?: string
        }
        if (!body.path || typeof body.content !== "string") {
          return json({ error: "path and content required" }, 400)
        }
        const message = body.message || `docs: update ${body.path}`
        if (body.mode === "pr") {
          return json(await openPullRequest(fullName, body.path, body.content, message, body.sha))
        }
        return json(await commitFile(fullName, body.path, body.content, message, body.sha))
      }
    } catch (e) {
      return json({ error: String(e) }, 502)
    }
  }

  if (sub === "/installations" && req.method === "GET") {
    try {
      const userSub = await sessionSub(req)
      const linked = userSub ? await getLinkedInstallations(userSub) : []
      if (!linked.length) return json([])
      return json(await listInstallations(linked))
    } catch (e) {
      return json({ error: String(e) }, 502)
    }
  }

  return json({ error: "not found", path }, 404)
}

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api/, "") || "/"

  // Auth endpoints, the GitHub webhook, and the GitHub install/OAuth
  // callback handle their own authentication.
  if (path.startsWith("/auth")) return handleAuth(req, path)
  if (path === "/github/webhook" || path === "/github/callback") {
    return handleGithub(req, path)
  }

  const unauthorized = await authenticate(req)
  if (unauthorized) return unauthorized

  if (path.startsWith("/github")) return handleGithub(req, path)

  return json({ error: "not found", path }, 404)
}

export const config: Config = {
  path: "/api/*",
}
