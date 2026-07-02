import fsDataBinary from "../node_modules/@electric-sql/pglite/dist/pglite.data"
import initdbWasmModule from "../node_modules/@electric-sql/pglite/dist/initdb.wasm"
import pgliteWasmModule from "../node_modules/@electric-sql/pglite/dist/pglite.wasm"

interface Env {
  ASSETS: Fetcher
  [key: string]: string | Fetcher | undefined
}

const fsBundle =
  fsDataBinary instanceof Blob ? fsDataBinary : new Blob([fsDataBinary as BlobPart])

function applyEnv(env: Env) {
  process.env.AUTH0_DOMAIN = String(env.AUTH0_DOMAIN ?? process.env.AUTH0_DOMAIN ?? "")
  process.env.AUTH0_AUDIENCE = String(env.AUTH0_AUDIENCE ?? process.env.AUTH0_AUDIENCE ?? "")
  process.env.AUTH0_CLIENT_ID = String(env.AUTH0_CLIENT_ID ?? process.env.AUTH0_CLIENT_ID ?? "")
  process.env.AUTH0_CLIENT_SECRET = String(
    env.AUTH0_CLIENT_SECRET ?? process.env.AUTH0_CLIENT_SECRET ?? ""
  )
  process.env.AUTH0_GITHUB_CONNECTION = String(
    env.AUTH0_GITHUB_CONNECTION ?? process.env.AUTH0_GITHUB_CONNECTION ?? "github"
  )
  process.env.GITHUB_API_URL = String(env.GITHUB_API_URL ?? process.env.GITHUB_API_URL ?? "")
  process.env.PGLITE_DATA_DIR = String(env.PGLITE_DATA_DIR ?? process.env.PGLITE_DATA_DIR ?? "")
  process.env.AUTH_BYPASS_JWT = String(env.AUTH_BYPASS_JWT ?? process.env.AUTH_BYPASS_JWT ?? "")
  process.env.AUTH_BYPASS_REFRESH_TOKEN = String(
    env.AUTH_BYPASS_REFRESH_TOKEN ?? process.env.AUTH_BYPASS_REFRESH_TOKEN ?? ""
  )
}

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    applyEnv(env)
    const url = new URL(request.url)

    if (url.pathname.startsWith("/api/")) {
      if (url.pathname.startsWith("/api/auth/")) {
        const { configurePGliteArtifacts } = await import(
          "../netlify/functions/lib/workspaces.ts"
        )
        configurePGliteArtifacts({
          pgliteWasmModule,
          initdbWasmModule,
          fsBundle,
        })
      }
      const { default: api } = await import("../netlify/functions/api.mts")
      return api(request, context as never)
    }

    return env.ASSETS.fetch(request)
  },
}
