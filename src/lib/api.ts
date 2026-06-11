export interface Profile {
  user: { login: string; avatar: string }
  orgs: Array<{ login: string; avatar: string }>
}

export interface RepoTree {
  branch: string
  files: string[]
}

export interface RepoFile {
  content: string
  sha: string
}

export interface SaveResult {
  commitUrl?: string
  prUrl?: string
  number?: number
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
  githubProfile: () => http<Profile>("/github/profile"),
  githubRepos: () => http<string[]>("/github/repos"),
  repoTree: (repo: string) => http<RepoTree>(`/github/repos/${repo}/tree`),
  repoFile: (repo: string, path: string) =>
    http<RepoFile>(`/github/repos/${repo}/file?path=${encodeURIComponent(path)}`),
  repoSave: (
    repo: string,
    body: { path: string; content: string; message?: string; mode: "main" | "pr"; sha?: string }
  ) =>
    http<SaveResult>(`/github/repos/${repo}/save`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  logout: () => http<{ ok: true }>("/auth/logout", { method: "POST" }),
}
