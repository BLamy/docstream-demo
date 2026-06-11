export interface PageMeta {
  id: string
  title: string
  path: string
  order: number
}

export interface Page extends PageMeta {
  markdown: string
}

export interface Installation {
  id: number
  account: string
  repositories: string[]
}

const BASE = "/api"

// Auth rides along automatically via the HttpOnly session cookie.
async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  })
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) detail = body.error
    } catch {
      /* not json */
    }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

export const api = {
  getPages: () => http<PageMeta[]>("/pages"),
  getPage: (id: string) => http<Page>(`/pages/${id}`),
  createPage: (input: { title: string }) =>
    http<Page>("/pages", { method: "POST", body: JSON.stringify(input) }),
  updatePage: (id: string, patch: Partial<Page>) =>
    http<Page>(`/pages/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deletePage: (id: string) => http<Page>(`/pages/${id}`, { method: "DELETE" }),

  githubInstallations: () => http<Installation[]>("/github/installations"),
  githubSync: (repo: string) =>
    http<{ committed: string[] }>("/github/sync", {
      method: "POST",
      body: JSON.stringify({ repo }),
    }),
  githubPull: (repo: string) =>
    http<{ imported: number }>("/github/pull", {
      method: "POST",
      body: JSON.stringify({ repo }),
    }),

  logout: () => http<{ ok: true }>("/auth/logout", { method: "POST" }),
}
