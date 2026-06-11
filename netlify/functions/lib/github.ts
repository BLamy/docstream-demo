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
    const repos = (await gh("/installation/repositories", token)) as {
      repositories: Array<{ full_name: string }>
    }
    out.push({
      id: inst.id,
      account: inst.account.login,
      repositories: repos.repositories.map((r) => r.full_name),
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
