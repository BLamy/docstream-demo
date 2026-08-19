# Local Emulators

Run the entire SaaS — GitHub, Auth0, and Stripe included — on your laptop with no network and no real accounts.

The repo vendors the [BLamy/emulate](https://github.com/BLamy/emulate) fork of `vercel-labs/emulate` as a git submodule. It provides stateful, production-fidelity emulators for every third-party service the app touches.

## Services

| Service | URL | Used for |
| --- | --- | --- |
| GitHub | `http://127.0.0.1:4300` | repos, trees, files, commits, PRs |
| Auth0 | `http://127.0.0.1:4301` | login, JWKS, refresh tokens |
| Stripe | `http://127.0.0.1:4302` | Pro checkout + webhooks |

## Setup

{% stepper %}
{% step %}
#### Build the emulators

```bash
git submodule update --init
npm run setup:emulate
```
{% endstep %}
{% step %}
#### Start the stack

```bash
npm run dev:stack
```

This starts all three emulators seeded from `emulate.config.yaml`, seeds demo markdown into the GitHub emulator, and runs the app through Netlify dev at `http://localhost:8888`.
{% endstep %}
{% step %}
#### Sign in

Use the seeded demo user: `brett@blamy.dev` / `DemoPass123!`
{% endstep %}
{% endstepper %}

## How each service is wired

* **GitHub** — `GITHUB_API_URL` points the REST client at the emulator; the seeded `local_blamy_token` grants the demo user access to `blamy/loop-qa` (public) and `blamy/secret-notes` (private).
* **Auth0** — `AUTH0_BASE_URL` redirects the token endpoint, JWKS, and issuer checks to the emulator. Login uses the password-realm grant, and the seeded user's GitHub token rides on the JWT as a namespaced claim — a local stand-in for Auth0 Token Vault.
* **Stripe** — `STRIPE_API_URL` points the checkout API at the emulator, which hosts a fake checkout page and dispatches signed `checkout.session.completed` webhooks back to the app.

{% hint style="success" %}
The whole demo journey — login → edit → upgrade via Stripe checkout → publish a private repo → anonymous public read — runs with zero external network calls.
{% endhint %}
