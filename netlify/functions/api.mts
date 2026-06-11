import type { Config, Context } from "@netlify/functions"
import { createRemoteJWKSet, jwtVerify } from "jose"
import {
  tasks,
  projects,
  labels,
  makeId,
  type Priority,
  type Task,
} from "./lib/data.ts"

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  })

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url)
  const requestPath = url.pathname.replace(/^\/api/, "") || "/"

  // Auth endpoints handle their own (lack of) authentication.
  if (requestPath.startsWith("/auth")) {
    return handleAuth(req, requestPath)
  }

  const unauthorized = await authenticate(req)
  if (unauthorized) return unauthorized

  const path = url.pathname.replace(/^\/api/, "") || "/"
  const method = req.method

  // GET /api/projects
  if (path === "/projects" && method === "GET") {
    return json(projects)
  }

  // GET /api/labels
  if (path === "/labels" && method === "GET") {
    return json(labels)
  }

  // GET /api/search?q=
  if (path === "/search" && method === "GET") {
    const q = (url.searchParams.get("q") || "").trim().toLowerCase()
    // Artificial latency: shorter queries take LONGER to come back, so
    // rapidly-typed queries can resolve out of order.
    const delay = Math.max(80, 700 - q.length * 90)
    await sleep(delay)
    const results = q
      ? tasks.filter((t) => t.content.toLowerCase().includes(q))
      : []
    return json({ query: q, results })
  }

  // /tasks collection
  if (path === "/tasks" && method === "GET") {
    const projectId = url.searchParams.get("projectId")
    const list = projectId
      ? tasks.filter((t) => t.projectId === projectId)
      : tasks
    return json(list)
  }

  if (path === "/tasks" && method === "POST") {
    const body = (await req.json()) as Partial<Task>
    const task: Task = {
      id: makeId(),
      content: (body.content || "").trim(),
      description: body.description ?? null,
      projectId: body.projectId || "inbox",
      priority: (body.priority as Priority) || 4,
      dueDate: body.dueDate ?? null,
      completed: false,
      labels: body.labels || [],
      order: tasks.length + 1,
      createdAt: new Date().toISOString(),
    }
    tasks.push(task)
    return json(task, 201)
  }

  // /tasks/:id
  const taskMatch = path.match(/^\/tasks\/([^/]+)$/)
  if (taskMatch) {
    const id = taskMatch[1]
    const idx = tasks.findIndex((t) => t.id === id)
    if (idx === -1) return json({ error: "not found" }, 404)

    if (method === "PATCH") {
      const body = (await req.json()) as Partial<Task>
      tasks[idx] = { ...tasks[idx], ...body, id }
      return json(tasks[idx])
    }

    if (method === "DELETE") {
      const [removed] = tasks.splice(idx, 1)
      return json(removed)
    }
  }

  return json({ error: "not found", path }, 404)
}

export const config: Config = {
  path: "/api/*",
}
