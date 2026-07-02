import { useEffect, useState, type FormEvent, type ReactNode } from "react"

import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const domain = import.meta.env.VITE_AUTH0_DOMAIN
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID
const audience = import.meta.env.VITE_AUTH0_AUDIENCE
// Email/password login through the Auth0 password-realm grant instead of the
// hosted redirect. Used against the local Auth0 emulator, and works on real
// tenants with ROPG enabled.
const passwordLogin = import.meta.env.VITE_AUTH0_PASSWORD_LOGIN === "true"

const STATE_KEY = "auth0_state"

function isPublicRoute() {
  const { pathname } = window.location
  return (
    pathname === "/github.com" ||
    pathname.startsWith("/github.com/") ||
    pathname === "/docs" ||
    pathname.startsWith("/docs/")
  )
}

function login() {
  const state = crypto.randomUUID()
  sessionStorage.setItem(STATE_KEY, state)
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: window.location.origin,
    // offline_access yields a refresh token, which Token Vault exchanges
    // for the user's GitHub access token server-side.
    scope: "openid profile email offline_access",
    state,
    // Always show the login screen instead of silently reusing the SSO session.
    prompt: "login",
    ...(audience ? { audience } : {}),
  })
  window.location.assign(`https://${domain}/authorize?${params}`)
}

// Auth0 Regular Web App flow: Auth0 redirects back to the site root with
// ?code=...; we forward it to a Netlify function that holds the client secret
// and sets an HttpOnly session cookie.
async function exchangeCodeIfPresent(): Promise<void> {
  const url = new URL(window.location.href)
  const code = url.searchParams.get("code")
  if (!code) return
  const state = url.searchParams.get("state")
  const expected = sessionStorage.getItem(STATE_KEY)
  sessionStorage.removeItem(STATE_KEY)
  url.searchParams.delete("code")
  url.searchParams.delete("state")
  window.history.replaceState({}, "", url)
  if (!expected || state !== expected) return
  await fetch("/api/auth/exchange", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, redirect_uri: window.location.origin }),
  })
}

function PasswordLoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.login(email, password)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="flex w-72 flex-col gap-3" onSubmit={submit}>
      <Input
        type="email"
        autoFocus
        required
        placeholder="Email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Input
        type="password"
        required
        placeholder="Password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"loading" | "anonymous" | "authenticated">(
    "loading"
  )

  useEffect(() => {
    if (isPublicRoute()) {
      setStatus("authenticated")
      return
    }
    // Until the .env is in place, run without auth so the app stays usable.
    if (!domain || !clientId) {
      setStatus("authenticated")
      return
    }
    exchangeCodeIfPresent()
      .then(() => fetch("/api/auth/me"))
      .then((res) => setStatus(res.ok ? "authenticated" : "anonymous"))
      .catch(() => setStatus("anonymous"))
  }, [])

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (status === "anonymous") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-semibold">blamy-notes</h1>
        {passwordLogin ? (
          <PasswordLoginForm onSuccess={() => setStatus("authenticated")} />
        ) : (
          <Button onClick={login}>Log in</Button>
        )}
      </div>
    )
  }

  return <>{children}</>
}
