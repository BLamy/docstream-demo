import { useEffect, type ReactNode } from "react"
import { Auth0Provider, useAuth0 } from "@auth0/auth0-react"

import { setTokenGetter } from "@/lib/auth-token"
import { Button } from "@/components/ui/button"

const domain = import.meta.env.VITE_AUTH0_DOMAIN
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID
const audience = import.meta.env.VITE_AUTH0_AUDIENCE

export function AuthProvider({ children }: { children: ReactNode }) {
  // Until the .env is in place, run without auth so the app stays usable.
  if (!domain || !clientId) return <>{children}</>

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        ...(audience ? { audience } : {}),
      }}
      cacheLocation="localstorage"
    >
      <RequireAuth>{children}</RequireAuth>
    </Auth0Provider>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, loginWithRedirect, getAccessTokenSilently } =
    useAuth0()

  useEffect(() => {
    setTokenGetter(() => getAccessTokenSilently())
  }, [getAccessTokenSilently])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-semibold">blamy-notes</h1>
        <Button onClick={() => loginWithRedirect()}>Log in</Button>
      </div>
    )
  }

  return <>{children}</>
}
