import { getStore } from "@netlify/blobs"

// Maps an Auth0 user (sub) to the GitHub App installation ids they connected.
// Stored in Netlify Blobs so the link survives function cold starts.

const store = () => getStore("user-installations")

export async function getLinkedInstallations(sub: string): Promise<number[]> {
  const raw = await store().get(sub)
  if (!raw) return []
  try {
    const ids = JSON.parse(raw) as number[]
    return Array.isArray(ids) ? ids : []
  } catch {
    return []
  }
}

export async function linkInstallations(sub: string, ids: number[]): Promise<number[]> {
  const existing = await getLinkedInstallations(sub)
  const merged = [...new Set([...existing, ...ids])]
  await store().set(sub, JSON.stringify(merged))
  return merged
}
