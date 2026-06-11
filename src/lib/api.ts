import type { Label, Project, Task } from "./types"
import { getAccessToken } from "./auth-token"

const BASE = "/api"

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...init,
  })
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  getProjects: () => http<Project[]>("/projects"),
  getLabels: () => http<Label[]>("/labels"),
  getTasks: (projectId?: string) =>
    http<Task[]>(`/tasks${projectId ? `?projectId=${projectId}` : ""}`),
  search: (q: string) =>
    http<{ query: string; results: Task[] }>(
      `/search?q=${encodeURIComponent(q)}`
    ),
  createTask: (input: Partial<Task>) =>
    http<Task>("/tasks", { method: "POST", body: JSON.stringify(input) }),
  updateTask: (id: string, patch: Partial<Task>) =>
    http<Task>(`/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteTask: (id: string) =>
    http<Task>(`/tasks/${id}`, { method: "DELETE" }),
}
