# blamy-notes

An Nx workspace for the GitBook-style notes SaaS: edit markdown in your GitHub repos, publish private repos as public docs sites (Pro plan via Stripe), and read the product docs at `/docs`.

## Stack

- Nx workspace with Vite React apps
- React 19, TypeScript, Tailwind v4, shadcn/ui
- Netlify Functions for GitHub/Auth0/Stripe-backed API routes
- TipTap for the full GitBook-style editor
- Streamdown for readonly AI stream markdown rendering
- [BLamy/emulate](https://github.com/BLamy/emulate) submodule: local GitHub, Auth0, and Stripe emulators

## SaaS features

- **Plans** — accounts start on Free; Stripe Checkout upgrades to Pro (webhook + return-URL fulfillment).
- **Publish public docs** — any repo can be published read-only at `/github.com/:owner/:repo`; publishing **private** repos requires Pro.
- **Docs site** — `/docs` serves the product documentation (quickstart, editor guide, publishing, billing, API reference).

## Run It

The main editor app needs both Vite and Netlify Functions, so run it through Netlify:

```bash
npm install
npm start
```

By default Netlify proxies the Vite app on `:5173` behind `http://localhost:8888` and mounts `/api/*`.

## Run the fully emulated stack

No real GitHub/Auth0/Stripe accounts needed — everything runs locally:

```bash
git submodule update --init
npm run setup:emulate   # pnpm build of the emulate fork (node >= 24)
npm run dev:stack
```

Then open http://localhost:8888 and sign in with `brett@blamy.dev` / `DemoPass123!`. The stack seeds a public repo (`blamy/loop-qa`) and a private one (`blamy/secret-notes`), a Pro price (`price_blamy_pro`, $12), and a Stripe webhook pointed at `/api/billing/webhook`.

Run the readonly Streamdown example separately:

```bash
npx nx serve streamdown-example
```

The example serves on `http://localhost:5174`.

## Scripts

| Script | What |
|---|---|
| `npm start` | Full main app through Netlify dev |
| `npm run dev:stack` | App + GitHub/Auth0/Stripe emulators, seeded |
| `npm run setup:emulate` | Build the emulate submodule packages |
| `npm run dev:emulate` | Emulators only (github, auth0, stripe) |
| `npm run dev` | Main app Vite dev server through Nx |
| `npm run build` | Main app typecheck + production build |
| `npm run build:streamdown-example` | Streamdown example typecheck + production build |
| `npm run typecheck` | Typecheck all Nx projects |
| `npm run lint` | Lint all Nx projects |
| `npm run roundtrip` | GitBook markdown parser/serializer round-trip tests |

## Layout

```text
apps/blamy-notes                 # GitHub-backed notes editor app
apps/streamdown-example          # Readonly AI stream renderer example
packages/docstream               # GitBook parser/serializer + readonly renderers
packages/docstream-editor        # Full TipTap GitBook editor package
netlify/functions                # Netlify API functions
scripts/roundtrip-test.ts        # GitBook markdown stability checks
```
