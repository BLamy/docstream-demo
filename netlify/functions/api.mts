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
// AUTH_DISABLED lets the API run open until the Auth0 .env is provisioned.
const AUTH_DISABLED = process.env.AUTH_DISABLED === "true"

const jwks = createRemoteJWKSet(
  new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`)
)

async function authenticate(req: Request): Promise<Response | null> {
  if (AUTH_DISABLED) return null
  const header = req.headers.get("authorization") || ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : null
  if (!token) return json({ error: "missing bearer token" }, 401)
  try {
    await jwtVerify(token, jwks, {
      issuer: `https://${AUTH0_DOMAIN}/`,
      ...(AUTH0_AUDIENCE ? { audience: AUTH0_AUDIENCE } : {}),
    })
    return null
  } catch {
    return json({ error: "invalid token" }, 401)
  }
}

export default async (req: Request, _context: Context) => {
  const unauthorized = await authenticate(req)
  if (unauthorized) return unauthorized

  const url = new URL(req.url)
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
