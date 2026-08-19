export interface Profile {
  user: { login: string; avatar: string }
  orgs: Array<{ login: string; avatar: string }>
}

export interface RepoInfo {
  full_name: string
  private: boolean
}

export type Plan = "free" | "pro"

export interface Billing {
  plan: Plan
  proPrice: { unitAmount: number; currency: string } | null
}

export interface RepoShare {
  id: string
  repo: string
  createdAt: string
}

export interface RepoTree {
  branch: string
  ref?: string
  assetRepo?: string
  htmlUrl?: string
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

export type PublicRepoSource =
  | { type: "default" }
  | { type: "branch"; branch: string }
  | { type: "pull"; number: number }

const BASE = "/api"

const repoPath = (repo: string) => repo.split("/").map(encodeURIComponent).join("/")

function publicSourceParams(source: PublicRepoSource, params = new URLSearchParams()) {
  if (source.type === "branch") params.set("branch", source.branch)
  if (source.type === "pull") params.set("pull", String(source.number))
  const query = params.toString()
  return query ? `?${query}` : ""
}

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
  githubRepos: () => http<RepoInfo[]>("/github/repos"),
  repoTree: (repo: string) => http<RepoTree>(`/github/repos/${repoPath(repo)}/tree`),
  repoFile: (repo: string, path: string) =>
    http<RepoFile>(`/github/repos/${repoPath(repo)}/file?path=${encodeURIComponent(path)}`),
  publicRepoTree: (repo: string, source: PublicRepoSource) =>
    http<RepoTree>(`/github/public/repos/${repoPath(repo)}/tree${publicSourceParams(source)}`),
  publicRepoFile: (repo: string, path: string, source: PublicRepoSource) =>
    http<RepoFile>(
      `/github/public/repos/${repoPath(repo)}/file${publicSourceParams(
        source,
        new URLSearchParams({ path })
      )}`
    ),
  repoSave: (
    repo: string,
    body: { path: string; content: string; message?: string; mode: "main" | "pr"; sha?: string }
  ) =>
    http<SaveResult>(`/github/repos/${repoPath(repo)}/save`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  login: (username: string, password: string) =>
    http<{ ok: true }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => http<{ ok: true }>("/auth/logout", { method: "POST" }),

  billing: () => http<Billing>("/billing"),
  billingCheckout: () =>
    http<{ url: string }>("/billing/checkout", { method: "POST", body: "{}" }),
  billingConfirm: (sessionId: string) =>
    http<{ plan: Plan; paymentStatus: string }>("/billing/confirm", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId }),
    }),

  shares: () => http<{ shares: RepoShare[] }>("/shares"),
  createShare: (repo: string) =>
    http<{ share: RepoShare }>("/shares", {
      method: "POST",
      body: JSON.stringify({ repo }),
    }),
  deleteShare: (id: string) =>
    http<{ ok: true }>(`/shares/${encodeURIComponent(id)}`, { method: "DELETE" }),
}
