// GitHub REST helpers operating with the USER's own access token (obtained
// via Auth0 Token Vault), so all access is scoped to what the logged-in
// GitHub user can see, and commits/PRs are authored as that user.

const API = process.env.GITHUB_API_URL || "https://api.github.com"

export class GitHubRestError extends Error {
  status: number

  constructor(method: string, path: string, status: number, body: string) {
    super(`GitHub ${method} ${path} -> ${status}: ${body}`)
    this.status = status
  }
}

async function gh(path: string, token?: string | null, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "x-github-api-version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    throw new GitHubRestError(init?.method ?? "GET", path, res.status, await res.text())
  }
  return res.status === 204 ? null : res.json()
}

const b64encode = (s: string) => Buffer.from(s, "utf8").toString("base64")
const b64decode = (s: string) => Buffer.from(s, "base64").toString("utf8")
const encodeGitHubPath = (path: string) =>
  path.split("/").map(encodeURIComponent).join("/")

export interface Profile {
  user: { login: string; avatar: string }
  orgs: Array<{ login: string; avatar: string }>
}

export type RepoSource =
  | { type: "default" }
  | { type: "branch"; branch: string }
  | { type: "pull"; number: number }

interface ResolvedRepoSource {
  treeFullName: string
  branch: string
  ref: string
  treeRef: string
  assetRepo: string
  htmlUrl: string
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

async function resolveBranch(
  token: string | null,
  fullName: string,
  branchName: string
): Promise<{ name: string; sha: string; treeSha: string }> {
  const branchPaths = [
    encodeURIComponent(branchName),
    encodeGitHubPath(branchName),
  ].filter((path, index, paths) => paths.indexOf(path) === index)

  for (const branchPath of branchPaths) {
    try {
      const branch = (await gh(`/repos/${fullName}/branches/${branchPath}`, token)) as {
        name: string
        commit: { sha: string }
      }
      return {
        name: branch.name,
        sha: branch.commit.sha,
        treeSha: await resolveCommitTreeSha(token, fullName, branch.commit.sha),
      }
    } catch {
      /* Try the next branch path form. */
    }
  }

  const refs = (await gh(
    `/repos/${fullName}/git/matching-refs/heads/${encodeGitHubPath(branchName)}`,
    token
  ).catch(() => [])) as Array<{ ref: string; object: { sha: string } }>
  const exact = refs.find((ref) => ref.ref === `refs/heads/${branchName}`)
  if (exact) {
    return {
      name: branchName,
      sha: exact.object.sha,
      treeSha: await resolveCommitTreeSha(token, fullName, exact.object.sha),
    }
  }

  throw new Error(`Branch not found: ${branchName}`)
}

async function resolveCommitTreeSha(
  token: string | null,
  fullName: string,
  commitSha: string
): Promise<string> {
  const commit = (await gh(`/repos/${fullName}/git/commits/${commitSha}`, token)) as {
    tree?: { sha?: string }
    commit?: { tree?: { sha?: string } }
  }
  const treeSha = commit.tree?.sha ?? commit.commit?.tree?.sha
  if (!treeSha) throw new Error(`Tree not found for commit: ${commitSha}`)
  return treeSha
}

async function resolveRepoSource(
  token: string | null,
  fullName: string,
  source: RepoSource = { type: "default" }
): Promise<ResolvedRepoSource> {
  const repo = (await gh(`/repos/${fullName}`, token)) as {
    default_branch: string
    html_url: string
  }

  if (source.type === "pull") {
    const pr = (await gh(`/repos/${fullName}/pulls/${source.number}`, token)) as {
      html_url: string
      head: { sha: string; ref: string; repo: { full_name: string } | null }
      number: number
    }
    if (!pr.head.repo) throw new Error(`Pull request head is unavailable: #${source.number}`)
    return {
      treeFullName: pr.head.repo.full_name,
      branch: `PR #${pr.number}: ${pr.head.ref}`,
      ref: pr.head.sha,
      treeRef: await resolveCommitTreeSha(token, pr.head.repo.full_name, pr.head.sha),
      assetRepo: pr.head.repo.full_name,
      htmlUrl: pr.html_url,
    }
  }

  if (source.type === "branch") {
    const branch = await resolveBranch(token, fullName, source.branch)
    return {
      treeFullName: fullName,
      branch: branch.name,
      ref: branch.sha,
      treeRef: branch.treeSha,
      assetRepo: fullName,
      htmlUrl: `${repo.html_url}/tree/${encodeGitHubPath(branch.name)}`,
    }
  }

  const branch = await resolveBranch(token, fullName, repo.default_branch)
  return {
    treeFullName: fullName,
    branch: branch.name,
    ref: branch.sha,
    treeRef: branch.treeSha,
    assetRepo: fullName,
    htmlUrl: repo.html_url,
  }
}

/** All markdown file paths in the requested repo ref, recursively. */
export async function listMarkdownTree(
  token: string | null,
  fullName: string,
  source?: RepoSource
): Promise<{ branch: string; ref: string; assetRepo: string; htmlUrl: string; files: string[] }> {
  const resolved = await resolveRepoSource(token, fullName, source)
  const tree = (await gh(
    `/repos/${resolved.treeFullName}/git/trees/${encodeURIComponent(resolved.treeRef)}?recursive=1`,
    token
  )) as { tree: Array<{ path: string; type: string }> }
  return {
    branch: resolved.branch,
    ref: resolved.ref,
    assetRepo: resolved.assetRepo,
    htmlUrl: resolved.htmlUrl,
    files: tree.tree
      .filter((e) => e.type === "blob" && e.path.endsWith(".md"))
      .map((e) => e.path)
      .sort(),
  }
}

export async function getFile(
  token: string | null,
  fullName: string,
  path: string,
  ref?: string
): Promise<{ content: string; sha: string }> {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : ""
  const file = (await gh(
    `/repos/${fullName}/contents/${encodeGitHubPath(path)}${query}`,
    token
  )) as { content: string; sha: string }
  return { content: b64decode(file.content.replace(/\n/g, "")), sha: file.sha }
}

export async function getFileFromSource(
  token: string | null,
  fullName: string,
  path: string,
  source?: RepoSource
): Promise<{ content: string; sha: string }> {
  const resolved = await resolveRepoSource(token, fullName, source)
  const tree = (await gh(
    `/repos/${resolved.treeFullName}/git/trees/${encodeURIComponent(resolved.treeRef)}?recursive=1`,
    token
  )) as { tree: Array<{ path: string; type: string; sha: string }> }
  const entry = tree.tree.find((item) => item.type === "blob" && item.path === path)
  if (!entry) {
    throw new GitHubRestError(
      "GET",
      `/repos/${resolved.treeFullName}/contents/${encodeGitHubPath(path)}`,
      404,
      "Not Found"
    )
  }
  const blob = (await gh(
    `/repos/${resolved.treeFullName}/git/blobs/${encodeURIComponent(entry.sha)}`,
    token
  )) as { content: string; encoding: string; sha: string }
  const content =
    blob.encoding === "base64" ? b64decode(blob.content.replace(/\n/g, "")) : blob.content
  return { content, sha: blob.sha }
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
  const res = (await gh(`/repos/${fullName}/contents/${encodeGitHubPath(path)}`, token, {
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
  await gh(`/repos/${fullName}/contents/${encodeGitHubPath(path)}`, token, {
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
