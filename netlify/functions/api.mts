import type { Config, Context } from "@netlify/functions"
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose"

import {
  commitFile,
  getFile,
  getFileFromSource,
  GitHubRestError,
  listMarkdownTree,
  listUserRepos,
  openPullRequest,
  type RepoSource,
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
// AUTH_BYPASS_JWT: when set, auth is bypassed — every request is treated as
// authenticated, with `sub` taken from this JWT. For local testing/scripting.
const AUTH_BYPASS_JWT = process.env.AUTH_BYPASS_JWT
// AUTH_BYPASS_REFRESH_TOKEN: an Auth0 refresh token used for the GitHub
// Token Vault exchange when no session refresh cookie is present.
const AUTH_BYPASS_REFRESH_TOKEN = process.env.AUTH_BYPASS_REFRESH_TOKEN

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
    const session = await ensureSession(req)
    if (session.failed || !session.sub) return json({ error: "not authenticated" }, 401)
    const { ensureAccountWorkspace } = await import("./lib/workspaces.ts")
    const accountWorkspace = await ensureAccountWorkspace(session.sub)
    const res = json({ sub: session.sub, ...accountWorkspace })
    for (const c of session.cookies) res.headers.append("set-cookie", c)
    return res
  }

  if (sub === "/logout" && req.method === "POST") {
    const headers = new Headers({ "content-type": "application/json" })
    headers.append("set-cookie", setCookie(COOKIE, "", 0))
    headers.append("set-cookie", setCookie(REFRESH_COOKIE, "", 0))
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
  }

  return json({ error: "not found", path }, 404)
}

interface Session {
  failed?: Response
  /** Set-Cookie headers to append to the response (after a silent refresh). */
  cookies: string[]
  sub?: string
}

// When a refresh succeeds with rotation, the request still carries the old
// refresh cookie — later lookups in the same request must see the new one.
const refreshedTokens = new WeakMap<Request, string>()

/**
 * Validates the session, silently refreshing the access token with the
 * refresh-token grant when it is missing or expired.
 */
async function ensureSession(req: Request): Promise<Session> {
  // When a bypass JWT is configured, the session is always authenticated.
  // The token need not be presented (the SPA uses cookies); we derive `sub`
  // from the bypass JWT itself, or from a matching Bearer token if sent.
  if (AUTH_BYPASS_JWT) {
    let sub = "auth-bypass"
    try {
      sub = String(decodeJwt(AUTH_BYPASS_JWT).sub ?? sub)
    } catch {
      /* not a decodable JWT — keep the placeholder sub */
    }
    return { cookies: [], sub }
  }

  const token = bearerOrCookieToken(req)
  if (token) {
    try {
      const { payload } = await verifyToken(token)
      return { cookies: [], sub: String(payload.sub) }
    } catch {
      /* expired/invalid — fall through to refresh */
    }
  }

  const refresh = cookieValue(req, REFRESH_COOKIE)
  if (refresh && AUTH0_CLIENT_ID && AUTH0_CLIENT_SECRET) {
    const res = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: AUTH0_CLIENT_ID,
        client_secret: AUTH0_CLIENT_SECRET,
        refresh_token: refresh,
      }),
    })
    if (res.ok) {
      const body = (await res.json()) as {
        access_token: string
        refresh_token?: string
        expires_in?: number
      }
      try {
        const { payload } = await verifyToken(body.access_token)
        const cookies = [setCookie(COOKIE, body.access_token, body.expires_in ?? 86400)]
        if (body.refresh_token) {
          cookies.push(setCookie(REFRESH_COOKIE, body.refresh_token, 30 * 86400))
          refreshedTokens.set(req, body.refresh_token)
        }
        return { cookies, sub: String(payload.sub) }
      } catch {
        /* refreshed token failed verification — treat as unauthenticated */
      }
    }
  }

  return { failed: json({ error: "missing bearer token" }, 401), cookies: [] }
}

/** GitHub access token for the logged-in user, via Auth0 Token Vault. */
async function githubToken(req: Request): Promise<string> {
  const refresh =
    AUTH_BYPASS_REFRESH_TOKEN ??
    refreshedTokens.get(req) ??
    cookieValue(req, REFRESH_COOKIE)
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
  if (e instanceof GitHubRestError) {
    return json({ error: e.message }, e.status)
  }
  return json({ error: String(e) }, 502)
}

function publicRepoSource(url: URL): RepoSource {
  const pull = url.searchParams.get("pull")
  const branch = url.searchParams.get("branch")
  if (pull) {
    const number = Number(pull)
    if (!Number.isInteger(number) || number < 1) {
      throw new Error("pull must be a positive integer")
    }
    return { type: "pull", number }
  }
  if (branch) return { type: "branch", branch }
  return { type: "default" }
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

  // GET /github/public/repos/:owner/:repo/(tree|file)
  // Public readonly preview endpoints intentionally skip Auth0. GitHub still
  // enforces repository visibility and unauthenticated API rate limits.
  const publicRepoMatch = sub.match(/^\/public\/repos\/([^/]+)\/([^/]+)\/(tree|file)$/)
  if (publicRepoMatch) {
    const fullName = `${decodeURIComponent(publicRepoMatch[1])}/${decodeURIComponent(publicRepoMatch[2])}`
    const action = publicRepoMatch[3]
    const url = new URL(req.url)
    let source: RepoSource
    try {
      source = publicRepoSource(url)
    } catch (e) {
      return json({ error: String(e instanceof Error ? e.message : e) }, 400)
    }
    try {
      if (action === "tree" && req.method === "GET") {
        return json(await listMarkdownTree(null, fullName, source))
      }
      if (action === "file" && req.method === "GET") {
        const filePath = url.searchParams.get("path")
        if (!filePath) return json({ error: "path required" }, 400)
        return json(await getFileFromSource(null, fullName, filePath, source))
      }
    } catch (e) {
      return githubError(e)
    }
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

  // Auth endpoints, public GitHub preview, the GitHub webhook, and the install callback handle
  // their own authentication.
  if (path.startsWith("/auth")) return handleAuth(req, path)
  if (path.startsWith("/github/public")) return handleGithub(req, path)
  if (path === "/github/webhook" || path === "/github/callback") {
    return handleGithub(req, path)
  }

  const session = await ensureSession(req)
  if (session.failed) return session.failed

  const res = path.startsWith("/github")
    ? await handleGithub(req, path)
    : json({ error: "not found", path }, 404)

  // Propagate any silently-refreshed session cookies.
  for (const c of session.cookies) res.headers.append("set-cookie", c)
  return res
}

export const config: Config = {
  path: "/api/*",
}
