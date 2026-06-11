// Bridges the Auth0 React context to the plain-module api client.
type TokenGetter = () => Promise<string>

let getToken: TokenGetter | null = null

export function setTokenGetter(fn: TokenGetter) {
  getToken = fn
}

export async function getAccessToken(): Promise<string | null> {
  if (!getToken) return null
  try {
    return await getToken()
  } catch {
    return null
  }
}
