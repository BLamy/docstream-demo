import { createPrivateKey } from "node:crypto"
import { SignJWT, importPKCS8 } from "jose"

const API = "https://api.github.com"

function appCreds() {
  const appId = process.env.GITHUB_APP_ID
  const pem = process.env.GITHUB_APP_PRIVATE_KEY
  if (!appId || !pem) throw new Error("GitHub App not configured")
  return { appId, pem }
}

async function appJwt(): Promise<string> {
  const { appId, pem } = appCreds()
  // GitHub issues PKCS#1 keys ("BEGIN RSA PRIVATE KEY"); jose needs PKCS#8.
  const pkcs8 = createPrivateKey(pem)
    .export({ type: "pkcs8", format: "pem" })
    .toString()
  const key = await importPKCS8(pkcs8, "RS256")
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 9 * 60)
    .setIssuer(appId)
    .sign(key)
}

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

export interface Installation {
  id: number
  account: string
  repositories: string[]
}

export async function listInstallations(): Promise<Installation[]> {
  const jwt = await appJwt()
  const installs = (await gh("/app/installations", jwt)) as Array<{
    id: number
    account: { login: string }
  }>
  const out: Installation[] = []
  for (const inst of installs) {
    const token = await installationToken(inst.id)
    const repos: Array<{ full_name: string; pushed_at: string }> = []
    for (let page = 1; page <= 10; page++) {
      const res = (await gh(
        `/installation/repositories?per_page=100&page=${page}`,
        token
      )) as { repositories: Array<{ full_name: string; pushed_at: string }> }
      repos.push(...res.repositories)
      if (res.repositories.length < 100) break
    }
    // Most recently pushed first.
    repos.sort((a, b) => (b.pushed_at ?? "").localeCompare(a.pushed_at ?? ""))
    out.push({
      id: inst.id,
      account: inst.account.login,
      repositories: repos.map((r) => r.full_name),
    })
  }
  return out
}

export async function installationToken(installationId: number): Promise<string> {
  const jwt = await appJwt()
  const res = (await gh(`/app/installations/${installationId}/access_tokens`, jwt, {
    method: "POST",
  })) as { token: string }
  return res.token
}

async function installationForRepo(fullName: string): Promise<number> {
  const jwt = await appJwt()
  const [owner, repo] = fullName.split("/")
  const res = (await gh(`/repos/${owner}/${repo}/installation`, jwt)) as { id: number }
  return res.id
}

const b64encode = (s: string) => Buffer.from(s, "utf8").toString("base64")
const b64decode = (s: string) => Buffer.from(s, "base64").toString("utf8")

/** Commits a set of markdown files to the repo's default branch. */
export async function pushFiles(
  fullName: string,
  files: Array<{ path: string; content: string }>,
  message: string
): Promise<{ committed: string[] }> {
  const token = await installationToken(await installationForRepo(fullName))
  const committed: string[] = []
  for (const file of files) {
    let sha: string | undefined
    try {
      const existing = (await gh(
        `/repos/${fullName}/contents/${encodeURIComponent(file.path)}`,
        token
      )) as { sha: string; content?: string }
      sha = existing.sha
      if (existing.content && b64decode(existing.content.replace(/\n/g, "")) === file.content) {
        continue // unchanged
      }
    } catch {
      /* new file */
    }
    await gh(`/repos/${fullName}/contents/${encodeURIComponent(file.path)}`, token, {
      method: "PUT",
      body: JSON.stringify({
        message: `${message}: ${file.path}`,
        content: b64encode(file.content),
        ...(sha ? { sha } : {}),
      }),
    })
    committed.push(file.path)
  }
  return { committed }
}

async function repoToken(fullName: string): Promise<string> {
  return installationToken(await installationForRepo(fullName))
}

/** All markdown file paths in the repo's default branch, recursively. */
export async function listMarkdownTree(fullName: string): Promise<{ branch: string; files: string[] }> {
  const token = await repoToken(fullName)
  const repo = (await gh(`/repos/${fullName}`, token)) as { default_branch: string }
  const tree = (await gh(
    `/repos/${fullName}/git/trees/${repo.default_branch}?recursive=1`,
    token
  )) as { tree: Array<{ path: string; type: string }>; truncated: boolean }
  return {
    branch: repo.default_branch,
    files: tree.tree
      .filter((e) => e.type === "blob" && e.path.endsWith(".md"))
      .map((e) => e.path)
      .sort(),
  }
}

export async function getFile(
  fullName: string,
  path: string
): Promise<{ content: string; sha: string }> {
  const token = await repoToken(fullName)
  const file = (await gh(
    `/repos/${fullName}/contents/${encodeURIComponent(path)}`,
    token
  )) as { content: string; sha: string }
  return { content: b64decode(file.content.replace(/\n/g, "")), sha: file.sha }
}

/** Commits one file directly to the default branch. */
export async function commitFile(
  fullName: string,
  path: string,
  content: string,
  message: string,
  sha?: string
): Promise<{ commitUrl: string }> {
  const token = await repoToken(fullName)
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
  fullName: string,
  path: string,
  content: string,
  message: string,
  sha?: string
): Promise<{ prUrl: string; number: number }> {
  const token = await repoToken(fullName)
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

/** Reads all top-level .md files from the repo's default branch. */
export async function pullFiles(
  fullName: string
): Promise<Array<{ path: string; content: string }>> {
  const token = await installationToken(await installationForRepo(fullName))
  const listing = (await gh(`/repos/${fullName}/contents/`, token)) as Array<{
    path: string
    type: string
    name: string
  }>
  const files: Array<{ path: string; content: string }> = []
  for (const entry of listing) {
    if (entry.type !== "file" || !entry.name.endsWith(".md")) continue
    const file = (await gh(
      `/repos/${fullName}/contents/${encodeURIComponent(entry.path)}`,
      token
    )) as { content: string }
    files.push({ path: entry.path, content: b64decode(file.content.replace(/\n/g, "")) })
  }
  return files
}
