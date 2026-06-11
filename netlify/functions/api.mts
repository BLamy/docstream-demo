import type { Config, Context } from "@netlify/functions"
import { createRemoteJWKSet, jwtVerify } from "jose"

import { pages, makeId, type Page } from "./lib/pages.ts"
import { listInstallations, pushFiles, pullFiles } from "./lib/github.ts"

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

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "page"

async function handleGithub(req: Request, path: string): Promise<Response> {
  const sub = path.replace(/^\/github/, "") || "/"

  // GitHub posts push/PR events here (configured on the GitHub App).
  if (sub === "/webhook" && req.method === "POST") {
    const event = req.headers.get("x-github-event") ?? "unknown"
    console.log(`github webhook: ${event}`)
    return json({ ok: true })
  }

  if (sub === "/installations" && req.method === "GET") {
    try {
      return json(await listInstallations())
    } catch (e) {
      return json({ error: String(e) }, 502)
    }
  }

  if (sub === "/sync" && req.method === "POST") {
    const { repo } = (await req.json()) as { repo?: string }
    if (!repo) return json({ error: "repo required (owner/name)" }, 400)
    try {
      const files = pages.map((p) => ({ path: p.path, content: p.markdown }))
      const result = await pushFiles(repo, files, "docs: sync from blamy-notes")
      return json(result)
    } catch (e) {
      return json({ error: String(e) }, 502)
    }
  }

  if (sub === "/pull" && req.method === "POST") {
    const { repo } = (await req.json()) as { repo?: string }
    if (!repo) return json({ error: "repo required (owner/name)" }, 400)
    try {
      const files = await pullFiles(repo)
      let imported = 0
      for (const file of files) {
        const title =
          file.content.match(/^#\s+(.+)$/m)?.[1] ?? file.path.replace(/\.md$/, "")
        const existing = pages.find((p) => p.path === file.path)
        if (existing) {
          existing.markdown = file.content
          existing.title = title
        } else {
          pages.push({
            id: makeId(),
            title,
            path: file.path,
            order: pages.length + 1,
            markdown: file.content,
          })
        }
        imported++
      }
      return json({ imported })
    } catch (e) {
      return json({ error: String(e) }, 502)
    }
  }

  return json({ error: "not found", path }, 404)
}

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api/, "") || "/"
  const method = req.method

  // Auth endpoints and the GitHub webhook handle their own authentication.
  if (path.startsWith("/auth")) return handleAuth(req, path)
  if (path === "/github/webhook") return handleGithub(req, path)

  const unauthorized = await authenticate(req)
  if (unauthorized) return unauthorized

  if (path.startsWith("/github")) return handleGithub(req, path)

  // GET /api/pages — sidebar tree (no markdown bodies)
  if (path === "/pages" && method === "GET") {
    return json(
      [...pages]
        .sort((a, b) => a.order - b.order)
        .map(({ id, title, path: p, order }) => ({ id, title, path: p, order }))
    )
  }

  if (path === "/pages" && method === "POST") {
    const body = (await req.json()) as Partial<Page>
    const title = (body.title || "Untitled").trim()
    const page: Page = {
      id: makeId(),
      title,
      path: body.path || `${slugify(title)}.md`,
      order: pages.length + 1,
      markdown: body.markdown ?? `# ${title}\n`,
    }
    pages.push(page)
    return json(page, 201)
  }

  const pageMatch = path.match(/^\/pages\/([^/]+)$/)
  if (pageMatch) {
    const page = pages.find((p) => p.id === pageMatch[1])
    if (!page) return json({ error: "not found" }, 404)

    if (method === "GET") return json(page)

    if (method === "PATCH") {
      const body = (await req.json()) as Partial<Page>
      if (typeof body.title === "string") page.title = body.title
      if (typeof body.markdown === "string") page.markdown = body.markdown
      if (typeof body.path === "string") page.path = body.path
      if (typeof body.order === "number") page.order = body.order
      return json(page)
    }

    if (method === "DELETE") {
      const idx = pages.findIndex((p) => p.id === page.id)
      pages.splice(idx, 1)
      return json(page)
    }
  }

  return json({ error: "not found", path }, 404)
}

export const config: Config = {
  path: "/api/*",
}
