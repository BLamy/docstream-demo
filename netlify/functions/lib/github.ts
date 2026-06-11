// GitHub REST helpers operating with the USER's own access token (obtained
// via Auth0 Token Vault), so all access is scoped to what the logged-in
// GitHub user can see, and commits/PRs are authored as that user.

const API = "https://api.github.com"

async function gh(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    throw new Error(`GitHub ${init?.method ?? "GET"} ${path} -> ${res.status}: ${await res.text()}`)
  }
  return res.status === 204 ? null : res.json()
}

const b64encode = (s: string) => Buffer.from(s, "utf8").toString("base64")
const b64decode = (s: string) => Buffer.from(s, "base64").toString("utf8")

export interface Profile {
  user: { login: string; avatar: string }
  orgs: Array<{ login: string; avatar: string }>
}

/** The logged-in user and the orgs they belong to (for the owner switcher). */
export async function userProfile(token: string): Promise<Profile> {
  const user = (await gh("/user", token)) as { login: string; avatar_url: string }
  const orgs = (await gh("/user/orgs?per_page=100", token).catch(() => [])) as Array<{
    login: string
    avatar_url: string
  }>
  return {
    user: { login: user.login, avatar: user.avatar_url },
    orgs: orgs.map((o) => ({ login: o.login, avatar: o.avatar_url })),
  }
}

/** Repos the user can access, most recently pushed first. */
export async function listUserRepos(token: string): Promise<string[]> {
  const repos: Array<{ full_name: string }> = []
  for (let page = 1; page <= 5; page++) {
    const res = (await gh(
      `/user/repos?sort=pushed&per_page=100&page=${page}`,
      token
    )) as Array<{ full_name: string }>
    repos.push(...res)
    if (res.length < 100) break
  }
  return repos.map((r) => r.full_name)
}

/** All markdown file paths in the repo's default branch, recursively. */
export async function listMarkdownTree(
  token: string,
  fullName: string
): Promise<{ branch: string; files: string[] }> {
  const repo = (await gh(`/repos/${fullName}`, token)) as { default_branch: string }
  const tree = (await gh(
    `/repos/${fullName}/git/trees/${repo.default_branch}?recursive=1`,
    token
  )) as { tree: Array<{ path: string; type: string }> }
  return {
    branch: repo.default_branch,
    files: tree.tree
      .filter((e) => e.type === "blob" && e.path.endsWith(".md"))
      .map((e) => e.path)
      .sort(),
  }
}

export async function getFile(
  token: string,
  fullName: string,
  path: string
): Promise<{ content: string; sha: string }> {
  const file = (await gh(
    `/repos/${fullName}/contents/${encodeURIComponent(path)}`,
    token
  )) as { content: string; sha: string }
  return { content: b64decode(file.content.replace(/\n/g, "")), sha: file.sha }
}

/** Commits one file directly to the default branch. */
export async function commitFile(
  token: string,
  fullName: string,
  path: string,
  content: string,
  message: string,
  sha?: string
): Promise<{ commitUrl: string }> {
  const res = (await gh(`/repos/${fullName}/contents/${encodeURIComponent(path)}`, token, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: b64encode(content),
      ...(sha ? { sha } : {}),
    }),
  })) as { commit: { html_url: string } }
  return { commitUrl: res.commit.html_url }
}

/** Commits one file to a new branch and opens a pull request. */
export async function openPullRequest(
  token: string,
  fullName: string,
  path: string,
  content: string,
  message: string,
  sha?: string
): Promise<{ prUrl: string; number: number }> {
  const repo = (await gh(`/repos/${fullName}`, token)) as { default_branch: string }
  const head = (await gh(
    `/repos/${fullName}/git/ref/heads/${repo.default_branch}`,
    token
  )) as { object: { sha: string } }
  const branch = `blamy-notes/${path.replace(/[^a-zA-Z0-9]+/g, "-")}-${Date.now().toString(36)}`
  await gh(`/repos/${fullName}/git/refs`, token, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: head.object.sha }),
  })
  await gh(`/repos/${fullName}/contents/${encodeURIComponent(path)}`, token, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: b64encode(content),
      branch,
      ...(sha ? { sha } : {}),
    }),
  })
  const pr = (await gh(`/repos/${fullName}/pulls`, token, {
    method: "POST",
    body: JSON.stringify({
      title: message,
      head: branch,
      base: repo.default_branch,
      body: `Docs update to \`${path}\` from [blamy-notes](https://blamy-notes.netlify.app).`,
    }),
  })) as { html_url: string; number: number }
  return { prUrl: pr.html_url, number: pr.number }
}
