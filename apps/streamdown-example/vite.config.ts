import path from "path"
import { almostnodePlugin } from "@agent-wasm/core/vite"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const workspaceRoot = path.resolve(__dirname, "../..")

export default defineConfig({
  root: __dirname,
  envDir: workspaceRoot,
  plugins: [almostnodePlugin(), react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: /^@brett_lamy\/docstream$/,
        replacement: path.resolve(workspaceRoot, "packages/docstream/src/index.ts"),
      },
    ],
  },
  server: {
    fs: {
      allow: [workspaceRoot],
    },
  },
  build: {
    outDir: path.resolve(workspaceRoot, "dist/apps/streamdown-example"),
    emptyOutDir: true,
  },
})
