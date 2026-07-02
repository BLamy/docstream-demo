// Full local SaaS stack: GitHub + Auth0 + Stripe emulators (BLamy/emulate
// submodule) seeded from emulate.config.yaml, demo markdown seeded into the
// GitHub emulator, and the app served through Netlify dev on :8888.
//
//   npm run setup:emulate   # once, after `git submodule update --init`
//   npm run dev:stack

import { mkdir, rm } from "node:fs/promises"
import path from "node:path"

import { spawnLogged, stop, waitForHttp } from "./process-utils.mjs"
import { seedGithub } from "./seed-github.mjs"

const ROOT = path.resolve(import.meta.dirname, "..")

const GITHUB_URL = "http://127.0.0.1:4300"
const AUTH0_URL = "http://127.0.0.1:4301"
const STRIPE_URL = "http://127.0.0.1:4302"
// Off the Netlify default (8888) so the stack can't collide with other local
// dev servers; the Stripe webhook seed in emulate.config.yaml matches.
const APP_PORT = 8899
const APP_URL = `http://localhost:${APP_PORT}`
const GITHUB_TOKEN = "local_blamy_token"

const PGLITE_DIR = path.join(ROOT, ".dev-stack", "pglite")
await rm(path.join(ROOT, ".dev-stack"), { recursive: true, force: true })
await mkdir(PGLITE_DIR, { recursive: true })

const emulator = spawnLogged(
  "node",
  [
    "emulate/packages/emulate/dist/index.js",
    "start",
    "--service",
    "github,auth0,stripe",
    "--seed",
    "emulate.config.yaml",
  ],
  { name: "emulate", cwd: ROOT }
)

const app = spawnLogged(
  "npx",
  ["netlify", "dev", "--filter", "blamy-notes", "--port", String(APP_PORT)],
  {
  name: "app",
  cwd: ROOT,
  env: {
    ...process.env,
    // GitHub API → emulator; the seeded token arrives via the Auth0 JWT claim.
    GITHUB_API_URL: GITHUB_URL,
    // Auth0 → emulator: token endpoint, JWKS, issuer, and the password login.
    AUTH0_BASE_URL: AUTH0_URL,
    AUTH0_CLIENT_ID: "blamy-notes-local",
    AUTH0_CLIENT_SECRET: "blamy-notes-local-secret",
    AUTH0_AUDIENCE: "https://blamy-notes.local/api",
    AUTH0_REALM: "Username-Password-Authentication",
    VITE_AUTH0_PASSWORD_LOGIN: "true",
    // Stripe → emulator.
    STRIPE_API_URL: STRIPE_URL,
    STRIPE_SECRET_KEY: "sk_test_emulated",
    STRIPE_PRO_PRICE_ID: "price_blamy_pro",
    STRIPE_WEBHOOK_SECRET: "whsec_blamy_local",
    // Fresh embedded Postgres per stack run.
    PGLITE_DATA_DIR: PGLITE_DIR,
    // Make sure stale bypass settings never leak into the stack.
    AUTH_BYPASS_JWT: "",
    AUTH_BYPASS_REFRESH_TOKEN: "",
  },
})

let stopping = false
async function shutdown() {
  if (stopping) return
  stopping = true
  await Promise.all([stop(app), stop(emulator)])
}

process.on("SIGINT", () => void shutdown().then(() => process.exit(0)))
process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)))
process.on("exit", () => {
  app.kill("SIGTERM")
  emulator.kill("SIGTERM")
})

try {
  await Promise.all([
    waitForHttp(`${GITHUB_URL}/rate_limit`),
    waitForHttp(`${AUTH0_URL}/.well-known/jwks.json`),
    waitForHttp(`${STRIPE_URL}/v1/prices`),
  ])
  console.log("[stack] emulators up — seeding GitHub demo content")
  await seedGithub(GITHUB_URL, GITHUB_TOKEN)
  await waitForHttp(APP_URL, { timeoutMs: 180_000 })
  console.log(`[stack] ready:
  app     ${APP_URL}   (login: brett@blamy.dev / DemoPass123!)
  github  ${GITHUB_URL}
  auth0   ${AUTH0_URL}
  stripe  ${STRIPE_URL}`)
} catch (e) {
  console.error(`[stack] startup failed: ${e instanceof Error ? e.message : e}`)
  await shutdown()
  process.exit(1)
}
