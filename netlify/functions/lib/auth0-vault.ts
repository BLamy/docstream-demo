// Auth0 Token Vault: exchanges the user's Auth0 refresh token for the GitHub
// access token of the GitHub identity they logged in with (same mechanism as
// @auth0/nextjs-auth0's getAccessTokenForConnection).

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || "webreplay.us.auth0.com"
const CONNECTION = process.env.AUTH0_GITHUB_CONNECTION || "github"

const cache = new Map<string, { token: string; exp: number }>()

export class GithubNotConnectedError extends Error {
  detail: string
  constructor(detail: string) {
    super("github not connected")
    this.detail = detail
  }
}

export async function githubTokenForUser(refreshToken: string): Promise<string> {
  const hit = cache.get(refreshToken)
  if (hit && hit.exp > Date.now() / 1000 + 60) return hit.token

  const res = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:
        "urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token",
      client_id: process.env.AUTH0_CLIENT_ID ?? "",
      client_secret: process.env.AUTH0_CLIENT_SECRET ?? "",
      subject_token_type: "urn:ietf:params:oauth:token-type:refresh_token",
      subject_token: refreshToken,
      connection: CONNECTION,
      requested_token_type:
        "http://auth0.com/oauth/token-type/federated-connection-access-token",
    }),
  })
  if (!res.ok) {
    throw new GithubNotConnectedError(await res.text())
  }
  const body = (await res.json()) as { access_token: string; expires_in?: number }
  cache.set(refreshToken, {
    token: body.access_token,
    exp: Date.now() / 1000 + (body.expires_in ?? 3600),
  })
  return body.access_token
}
