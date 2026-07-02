import type { Config, Context } from "@netlify/functions"
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose"

import {
  commitFile,
  getFile,
  getFileFromSource,
  getRepoInfo,
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
// AUTH0_BASE_URL overrides the tenant URL, e.g. to point at a local Auth0
// emulator (http://127.0.0.1:4301). Defaults to the real tenant over https.
const AUTH0_BASE = process.env.AUTH0_BASE_URL || `https://${AUTH0_DOMAIN}`
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID
const AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET
const AUTH0_REALM = process.env.AUTH0_REALM || "Username-Password-Authentication"
// Namespaced JWT claim carrying the user's GitHub token directly (the Auth0
// emulator maps app_metadata.github_token here). When present it replaces
// the Token Vault exchange.
const GITHUB_TOKEN_CLAIM =
  process.env.AUTH0_GITHUB_TOKEN_CLAIM || "https://blamy-notes.local/github_token"
const COOKIE = "auth_token"
const REFRESH_COOKIE = "auth_refresh"
// AUTH_BYPASS_JWT: when set, auth is bypassed — every request is treated as
// authenticated, with `sub` taken from this JWT. For local testing/scripting.
const AUTH_BYPASS_JWT = process.env.AUTH_BYPASS_JWT
// AUTH_BYPASS_REFRESH_TOKEN: an Auth0 refresh token used for the GitHub
// Token Vault exchange when no session refresh cookie is present.
const AUTH_BYPASS_REFRESH_TOKEN = process.env.AUTH_BYPASS_REFRESH_TOKEN

const jwks = createRemoteJWKSet(new URL(`${AUTH0_BASE}/.well-known/jwks.json`))

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
    issuer: `${AUTH0_BASE}/`,
    ...(AUTH0_AUDIENCE ? { audience: AUTH0_AUDIENCE } : {}),
  })
}

const setCookie = (name: string, value: string, maxAge: number) =>
  `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`

interface TokenGrant {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

/** Turns an Auth0 token grant into the two HttpOnly session cookies. */
function sessionResponse(grant: TokenGrant): Response {
  const headers = new Headers({ "content-type": "application/json" })
  headers.append("set-cookie", setCookie(COOKIE, grant.access_token, grant.expires_in ?? 86400))
  if (grant.refresh_token) {
    headers.append("set-cookie", setCookie(REFRESH_COOKIE, grant.refresh_token, 30 * 86400))
  }
  return new Response(JSON.stringify({ ok: true, offline: !!grant.refresh_token }), {
    status: 200,
    headers,
  })
}

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
    const res = await fetch(`${AUTH0_BASE}/oauth/token`, {
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
    return sessionResponse((await res.json()) as TokenGrant)
  }

  // Resource Owner Password (Auth0 password-realm) login. The primary flow
  // stays the hosted redirect; this powers environments without a browser
  // redirect target — the Auth0 emulator and tenants with ROPG enabled.
  if (sub === "/login" && req.method === "POST") {
    if (!AUTH0_CLIENT_ID || !AUTH0_CLIENT_SECRET) {
      return json({ error: "auth not configured" }, 500)
    }
    const { username, password } = (await req.json()) as {
      username?: string
      password?: string
    }
    if (!username || !password) {
      return json({ error: "username and password required" }, 400)
    }
    const res = await fetch(`${AUTH0_BASE}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "http://auth0.com/oauth/grant-type/password-realm",
        client_id: AUTH0_CLIENT_ID,
        client_secret: AUTH0_CLIENT_SECRET,
        username,
        password,
        realm: AUTH0_REALM,
        scope: "openid profile email offline_access",
        ...(AUTH0_AUDIENCE ? { audience: AUTH0_AUDIENCE } : {}),
      }),
    })
    if (!res.ok) {
      let detail = "login failed"
      try {
        const body = (await res.json()) as { error_description?: string }
        if (body.error_description) detail = body.error_description
      } catch {
        /* non-json error body */
      }
      return json({ error: detail }, 401)
    }
    return sessionResponse((await res.json()) as TokenGrant)
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
    const res = await fetch(`${AUTH0_BASE}/oauth/token`, {
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

/**
 * GitHub token carried directly on the session JWT as a namespaced claim.
 * The Auth0 emulator injects it from user app_metadata; real tenants leave
 * it unset and fall through to Token Vault.
 */
function githubTokenFromClaim(req: Request): string | null {
  const token = bearerOrCookieToken(req)
  if (!token) return null
  try {
    const claim = decodeJwt(token)[GITHUB_TOKEN_CLAIM]
    return typeof claim === "string" && claim ? claim : null
  } catch {
    return null
  }
}

/** GitHub access token for the logged-in user, via Auth0 Token Vault. */
async function githubToken(req: Request): Promise<string> {
  const fromClaim = githubTokenFromClaim(req)
  if (fromClaim) return fromClaim

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

/** Resolves the stored credential of a published repo for anonymous reads. */
async function shareGithubToken(share: {
  githubToken: string | null
  vaultRefreshToken: string | null
}): Promise<string | null> {
  if (share.githubToken) return share.githubToken
  if (share.vaultRefreshToken) return githubTokenForUser(share.vaultRefreshToken)
  return null
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

// ---------- Billing (Stripe) ----------

// Upgrades are one-time Checkout purchases of the Pro plan. Fulfillment is
// double-covered: the Stripe webhook flips the plan server-to-server, and
// /billing/confirm verifies the session when the browser lands back on the
// success URL (covers environments where the webhook can't reach us).
async function handleBilling(req: Request, path: string, sub: string): Promise<Response> {
  const action = path.replace(/^\/billing/, "") || "/"
  const { ensureAccountWorkspace, setAccountPlan } = await import("./lib/workspaces.ts")
  const stripe = await import("./lib/stripe.ts")
  const { account } = await ensureAccountWorkspace(sub)

  if (action === "/" && req.method === "GET") {
    let proPrice: { unitAmount: number; currency: string } | null = null
    try {
      proPrice = await stripe.getProPrice()
    } catch {
      /* Stripe unconfigured/unreachable — the UI hides the price. */
    }
    return json({ plan: account.plan, proPrice })
  }

  if (action === "/checkout" && req.method === "POST") {
    if (account.plan === "pro") return json({ error: "already on pro" }, 409)
    const origin = new URL(req.url).origin
    try {
      const session = await stripe.createCheckoutSession({
        priceId: stripe.PRO_PRICE_ID,
        successUrl: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/?billing=cancelled`,
        metadata: { account_id: account.id, auth0_sub: sub },
      })
      if (!session.url) return json({ error: "checkout session has no url" }, 502)
      return json({ url: session.url })
    } catch (e) {
      return json({ error: String(e instanceof Error ? e.message : e) }, 502)
    }
  }

  if (action === "/confirm" && req.method === "POST") {
    const { session_id } = (await req.json()) as { session_id?: string }
    if (!session_id) return json({ error: "session_id required" }, 400)
    try {
      const session = await stripe.getCheckoutSession(session_id)
      if (session.metadata?.account_id !== account.id) {
        return json({ error: "session does not belong to this account" }, 403)
      }
      if (session.payment_status !== "paid") {
        return json({ plan: account.plan, paymentStatus: session.payment_status })
      }
      await setAccountPlan(account.id, "pro")
      return json({ plan: "pro", paymentStatus: session.payment_status })
    } catch (e) {
      return json({ error: String(e instanceof Error ? e.message : e) }, 502)
    }
  }

  return json({ error: "not found", path }, 404)
}

/** Stripe webhook: signature-verified, no session. */
async function handleBillingWebhook(req: Request): Promise<Response> {
  const { verifyWebhookSignature, WEBHOOK_SECRET } = await import("./lib/stripe.ts")
  const body = await req.text()
  if (!verifyWebhookSignature(body, req.headers, WEBHOOK_SECRET)) {
    return json({ error: "invalid signature" }, 400)
  }
  const event = JSON.parse(body) as {
    type: string
    data?: { object?: { payment_status?: string; metadata?: Record<string, string> } }
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data?.object
    const accountId = session?.metadata?.account_id
    if (accountId && session?.payment_status === "paid") {
      const { setAccountPlan } = await import("./lib/workspaces.ts")
      await setAccountPlan(accountId, "pro")
      console.log(`billing webhook: account ${accountId} upgraded to pro`)
    }
  }
  return json({ received: true })
}

// ---------- Public doc shares ----------

// Publishing a repo puts its rendered markdown at /github.com/:owner/:repo
// for anonymous visitors. For private repos that means the server must keep
// a credential to read on the owner's behalf (Pro plan feature).
async function handleShares(req: Request, path: string, sub: string): Promise<Response> {
  const action = path.replace(/^\/shares/, "") || "/"
  const workspaces = await import("./lib/workspaces.ts")
  const { account } = await workspaces.ensureAccountWorkspace(sub)

  if (action === "/" && req.method === "GET") {
    return json({ shares: await workspaces.listRepoShares(account.id) })
  }

  if (action === "/" && req.method === "POST") {
    const { repo } = (await req.json()) as { repo?: string }
    if (!repo || !/^[^/\s]+\/[^/\s]+$/.test(repo)) {
      return json({ error: "repo must be owner/name" }, 400)
    }
    // The publisher must actually have access to the repo; the same call
    // tells us whether it is private, which is the Pro-gated case (the server
    // must retain a credential to serve private content publicly).
    let repoInfo: Awaited<ReturnType<typeof getRepoInfo>>
    try {
      repoInfo = await getRepoInfo(await githubToken(req), repo)
    } catch (e) {
      return githubError(e)
    }
    if (repoInfo.private && account.plan !== "pro") {
      return json(
        {
          error: "pro_plan_required",
          detail: "Publishing private repos as public docs requires the Pro plan.",
        },
        402
      )
    }
    const fromClaim = githubTokenFromClaim(req)
    const refresh = refreshedTokens.get(req) ?? cookieValue(req, REFRESH_COOKIE)
    const share = await workspaces.createRepoShare({
      accountId: account.id,
      repo,
      githubToken: fromClaim,
      vaultRefreshToken: fromClaim ? null : refresh,
    })
    return json({ share })
  }

  const deleteMatch = action.match(/^\/([^/]+)$/)
  if (deleteMatch && req.method === "DELETE") {
    const removed = await workspaces.deleteRepoShare(account.id, deleteMatch[1])
    if (!removed) return json({ error: "share not found" }, 404)
    return json({ ok: true })
  }

  return json({ error: "not found", path }, 404)
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
  // Public readonly preview endpoints intentionally skip Auth0. Repos the
  // owner published (repo_shares) are read with the stored credential, so
  // private repos work; everything else falls back to unauthenticated GitHub,
  // which still enforces repository visibility and rate limits.
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
      const { findRepoShare } = await import("./lib/workspaces.ts")
      const share = await findRepoShare(fullName)
      const token = share ? await shareGithubToken(share) : null
      if (action === "tree" && req.method === "GET") {
        return json(await listMarkdownTree(token, fullName, source))
      }
      if (action === "file" && req.method === "GET") {
        const filePath = url.searchParams.get("path")
        if (!filePath) return json({ error: "path required" }, 400)
        return json(await getFileFromSource(token, fullName, filePath, source))
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

  // Auth endpoints, public GitHub preview, webhooks, and the install callback
  // handle their own authentication.
  if (path.startsWith("/auth")) return handleAuth(req, path)
  if (path.startsWith("/github/public")) return handleGithub(req, path)
  if (path === "/github/webhook" || path === "/github/callback") {
    return handleGithub(req, path)
  }
  if (path === "/billing/webhook" && req.method === "POST") {
    return handleBillingWebhook(req)
  }

  const session = await ensureSession(req)
  if (session.failed) return session.failed

  const res = path.startsWith("/github")
    ? await handleGithub(req, path)
    : path.startsWith("/billing")
      ? await handleBilling(req, path, session.sub!)
      : path.startsWith("/shares")
        ? await handleShares(req, path, session.sub!)
        : json({ error: "not found", path }, 404)

  // Propagate any silently-refreshed session cookies.
  for (const c of session.cookies) res.headers.append("set-cookie", c)
  return res
}

export const config: Config = {
  path: "/api/*",
}
