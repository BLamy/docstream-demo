# blamy-notes

An Nx workspace for the GitBook-style notes editor and extracted markdown rendering packages.

## Stack

- Nx workspace with Vite React apps
- React 19, TypeScript, Tailwind v4, shadcn/ui
- Netlify Functions for GitHub/Auth0-backed API routes
- TipTap for the full GitBook-style editor
- Streamdown for readonly AI stream markdown rendering

## Run It

The main editor app needs both Vite and Netlify Functions, so run it through Netlify:

```bash
npm install
npm start
```

By default Netlify proxies the Vite app on `:5173` behind `http://localhost:8888` and mounts `/api/*`.

Run the readonly Streamdown example separately:

```bash
npx nx serve streamdown-example
```

The example serves on `http://localhost:5174`.

## Scripts

| Script | What |
|---|---|
| `npm start` | Full main app through Netlify dev |
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
