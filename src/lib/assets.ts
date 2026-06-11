// Resolves repo-relative image paths (e.g. "readme-assets/logo.svg") against
// the raw.githubusercontent.com URL of the file being edited. The AST keeps
// the original relative src; only rendering resolves it.

let assetBase: string | null = null

export function setAssetBase(repo: string | null, branch: string | null, filePath: string | null) {
  if (!repo || !branch || !filePath) {
    assetBase = null
    return
  }
  const dir = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/") + 1) : ""
  assetBase = `https://raw.githubusercontent.com/${repo}/${branch}/${dir}`
}

export function resolveAsset(src: string): string {
  if (!src || /^(https?:|data:|blob:)/i.test(src)) return src
  if (!assetBase) return src
  return assetBase + src.replace(/^\.\//, "")
}
