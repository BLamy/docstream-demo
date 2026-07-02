import type { PublicRepoSource } from "@/lib/api"

export interface PublicGithubPreview {
  owner: string
  name: string
  repo: string
  source: PublicRepoSource
}

export function isPublicGithubRoute(pathname: string) {
  return pathname === "/github.com" || pathname.startsWith("/github.com/")
}

function decodePathPart(part: string) {
  try {
    return decodeURIComponent(part)
  } catch {
    return part
  }
}

export function parsePublicGithubPreview(pathname: string): PublicGithubPreview | null {
  const parts = pathname.split("/").filter(Boolean)
  if (parts[0] !== "github.com" || parts.length < 3) return null

  const owner = decodePathPart(parts[1])
  const name = decodePathPart(parts[2])
  if (!owner || !name) return null

  if (parts.length === 3) {
    return { owner, name, repo: `${owner}/${name}`, source: { type: "default" } }
  }

  if (parts[3] === "pull" && parts.length === 5) {
    const number = Number(decodePathPart(parts[4]))
    if (!Number.isInteger(number) || number < 1) return null
    return { owner, name, repo: `${owner}/${name}`, source: { type: "pull", number } }
  }

  if (parts[3] === "tree" && parts.length > 4) {
    const branch = parts.slice(4).map(decodePathPart).join("/")
    if (!branch) return null
    return { owner, name, repo: `${owner}/${name}`, source: { type: "branch", branch } }
  }

  return null
}

export function preferredMarkdownFile(files: string[]) {
  const byLower = new Map(files.map((path) => [path.toLowerCase(), path]))
  for (const candidate of ["readme.md", "docs/readme.md", "summary.md"]) {
    const match = byLower.get(candidate)
    if (match) return match
  }
  return files.find((path) => !path.includes("/")) ?? files[0] ?? null
}

export function publicSourceLabel(preview: PublicGithubPreview) {
  if (preview.source.type === "pull") return `PR #${preview.source.number}`
  if (preview.source.type === "branch") return preview.source.branch
  return "default branch"
}

export function githubUrlForPreview(preview: PublicGithubPreview) {
  const base = `https://github.com/${preview.repo}`
  if (preview.source.type === "pull") return `${base}/pull/${preview.source.number}`
  if (preview.source.type === "branch") {
    const branchPath = preview.source.branch.split("/").map(encodeURIComponent).join("/")
    return `${base}/tree/${branchPath}`
  }
  return base
}

/** "notes/incident-runbook.md" -> "Incident Runbook" */
export function titleFromPath(path: string) {
  const base = path.split("/").pop() ?? path
  const stem = base.replace(/\.md$/i, "")
  if (/^readme$/i.test(stem)) return "Overview"
  return stem
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}
