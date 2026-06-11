import type { Config, Context } from "@netlify/functions"
import { createRemoteJWKSet, jwtVerify } from "jose"

import {
  commitFile,
  getFile,
  listMarkdownTree,
  listUserRepos,
  openPullRequest,
  userProfile,
} from "./lib/github.ts"
import { GithubNotConnectedError, githubTokenForUser } from "./lib/auth0-vault.ts"

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
const REFRESH_COOKIE = "auth_refresh"
// AUTH_DISABLED lets the API run open until the Auth0 .env is provisioned.
const AUTH_DISABLED = process.env.AUTH_DISABLED === "true"

const jwks = createRemoteJWKSet(
  new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`)
)

function cookieValue(req: Request, name: string): string | null {
  const cookies = req.headers.get("cookie") || ""
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return match ? match[1] : null
}

function bearerOrCookieToken(req: Request): string | null {
  const header = req.headers.get("authorization") || ""
  if (header.startsWith("Bearer ")) return header.slice(7)
  return cookieValue(req, COOKIE)
}

async function verifyToken(token: string) {
  return jwtVerify(token, jwks, {
    issuer: `https://${AUTH0_DOMAIN}/`,
    ...(AUTH0_AUDIENCE ? { audience: AUTH0_AUDIENCE } : {}),
  })
}

const setCookie = (name: string, value: string, maxAge: number) =>
  `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`

// Auth0 Regular Web App flow: the SPA lands back on the site root with
// ?code=... and forwards it here; the secret-bearing exchange stays
// server-side. The session is two HttpOnly cookies: the access token (JWT)
// and the refresh token, which Token Vault exchanges for per-user GitHub
// access tokens.
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
    const { access_token, refresh_token, expires_in } = (await res.json()) as {
      access_token: string
      refresh_token?: string
      expires_in: number
    }
    const headers = new Headers({ "content-type": "application/json" })
    headers.append("set-cookie", setCookie(COOKIE, access_token, expires_in ?? 86400))
    if (refresh_token) {
      headers.append("set-cookie", setCookie(REFRESH_COOKIE, refresh_token, 30 * 86400))
    }
    return new Response(JSON.stringify({ ok: true, offline: !!refresh_token }), {
      status: 200,
      headers,
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
    const headers = new Headers({ "content-type": "application/json" })
    headers.append("set-cookie", setCookie(COOKIE, "", 0))
    headers.append("set-cookie", setCookie(REFRESH_COOKIE, "", 0))
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
  }

  return json({ error: "not found", path }, 404)
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

/** GitHub access token for the logged-in user, via Auth0 Token Vault. */
async function githubToken(req: Request): Promise<string> {
  const refresh = cookieValue(req, REFRESH_COOKIE)
  if (!refresh) {
    throw new GithubNotConnectedError(
      "no refresh token in session — log in again (offline_access)"
    )
  }
  return githubTokenForUser(refresh)
}

function githubError(e: unknown): Response {
  if (e instanceof GithubNotConnectedError) {
    return json({ error: "github_not_connected", detail: e.detail }, 428)
  }
  return json({ error: String(e) }, 502)
}

async function handleGithub(req: Request, path: string): Promise<Response> {
  const sub = path.replace(/^\/github/, "") || "/"

  // GitHub posts push/PR events here (configured on the GitHub App).
  if (sub === "/webhook" && req.method === "POST") {
    const event = req.headers.get("x-github-event") ?? "unknown"
    console.log(`github webhook: ${event}`)
    return json({ ok: true })
  }

  // Legacy GitHub App install/OAuth callback — repo access is user-scoped via
  // Token Vault now, so this just drops the user back into the app.
  if (sub === "/callback" && req.method === "GET") {
    return new Response(null, { status: 302, headers: { location: "/" } })
  }

  // GET /github/profile — the user and their orgs, for the owner switcher
  if (sub === "/profile" && req.method === "GET") {
    try {
      const token = await githubToken(req)
      return json(await userProfile(token))
    } catch (e) {
      return githubError(e)
    }
  }

  // GET /github/repos — repos the logged-in GitHub user can access
  if (sub === "/repos" && req.method === "GET") {
    try {
      const token = await githubToken(req)
      return json(await listUserRepos(token))
    } catch (e) {
      return githubError(e)
    }
  }

  // /github/repos/:owner/:repo/(tree|file|save)
  const repoMatch = sub.match(/^\/repos\/([^/]+)\/([^/]+)\/(tree|file|save)$/)
  if (repoMatch) {
    const fullName = `${repoMatch[1]}/${repoMatch[2]}`
    const action = repoMatch[3]
    try {
      const token = await githubToken(req)
      if (action === "tree" && req.method === "GET") {
        return json(await listMarkdownTree(token, fullName))
      }
      if (action === "file" && req.method === "GET") {
        const url = new URL(req.url)
        const filePath = url.searchParams.get("path")
        if (!filePath) return json({ error: "path required" }, 400)
        return json(await getFile(token, fullName, filePath))
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
          return json(
            await openPullRequest(token, fullName, body.path, body.content, message, body.sha)
          )
        }
        return json(await commitFile(token, fullName, body.path, body.content, message, body.sha))
      }
    } catch (e) {
      return githubError(e)
    }
  }

  return json({ error: "not found", path }, 404)
}

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api/, "") || "/"

  // Auth endpoints, the GitHub webhook, and the install callback handle
  // their own authentication.
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
