# API Reference

The REST API behind the app. All endpoints live under `/api`.

Authenticated endpoints use the HttpOnly session cookie set at login. Public endpoints require no credentials.

## Auth

### POST /api/auth/login

Email/password login (Auth0 password-realm grant). Sets the session cookies.

```bash
curl -X POST https://your-app.example/api/auth/login \
  -H "content-type: application/json" \
  -d '{"username":"you@example.com","password":"..."}'
```

### GET /api/auth/me

The current session's account and workspace.

```json
{
  "sub": "auth0|100001",
  "account": { "id": "acct_…", "auth0Sub": "auth0|100001", "plan": "pro" },
  "workspace": { "id": "ws_…", "slug": "workspace-auth0-100001", "name": "Personal Workspace" }
}
```

## Repositories

### GET /api/github/repos

Repositories the logged-in user can access.

```json
[
  { "full_name": "blamy/loop-qa", "private": false },
  { "full_name": "blamy/secret-notes", "private": true }
]
```

### GET /api/github/repos/:owner/:repo/tree

All markdown files in the repository's default branch.

### GET /api/github/repos/:owner/:repo/file?path=README.md

One file's content and blob SHA.

### POST /api/github/repos/:owner/:repo/save

Commit a change directly or through a pull request.

```bash
curl -X POST https://your-app.example/api/github/repos/blamy/loop-qa/save \
  -H "content-type: application/json" \
  -d '{
    "path": "docs/getting-started.md",
    "content": "# Hello",
    "message": "docs: update getting started",
    "mode": "pr",
    "sha": "<blob sha>"
  }'
```

`mode` is `"main"` (direct commit) or `"pr"` (branch + pull request).

## Billing

### GET /api/billing

Current plan and the Pro price.

```json
{ "plan": "free", "proPrice": { "unitAmount": 1200, "currency": "usd" } }
```

### POST /api/billing/checkout

Creates a Stripe Checkout session for the Pro upgrade. Redirect the browser to the returned `url`.

```json
{ "url": "https://checkout.stripe.com/c/pay/cs_…" }
```

### POST /api/billing/confirm

Verifies a completed checkout session (`{"session_id":"cs_…"}`) and activates Pro. The Stripe `checkout.session.completed` webhook at `POST /api/billing/webhook` performs the same fulfillment server-to-server.

## Publishing

### GET /api/shares

The repositories you have published.

### POST /api/shares

Publish a repository. Requires the Pro plan — returns `402 pro_plan_required` otherwise.

```bash
curl -X POST https://your-app.example/api/shares \
  -H "content-type: application/json" \
  -d '{"repo":"blamy/secret-notes"}'
```

### DELETE /api/shares/:id

Unpublish. The public URL is revoked immediately.

## Public (no auth)

### GET /api/github/public/repos/:owner/:repo/tree

### GET /api/github/public/repos/:owner/:repo/file?path=…

Read-only access to published repositories (and repos that are public on GitHub). Optional `?branch=` or `?pull=` select a preview source.

{% hint style="info" %}
Public reads of a published private repository use the credential captured at publish time — visitors never authenticate.
{% endhint %}
