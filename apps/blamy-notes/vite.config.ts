import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const workspaceRoot = path.resolve(__dirname, "../..")

// https://vite.dev/config/
export default defineConfig({
  root: __dirname,
  envDir: workspaceRoot,
  plugins: [react(), tailwindcss()],
  resolve: {
    // Linked workspace packages must share the app's React runtime.
    dedupe: ["react", "react-dom"],
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      {
        find: /^@brett_lamy\/docstream$/,
        replacement: path.resolve(workspaceRoot, "packages/docstream/src/index.ts"),
      },
      {
        find: /^@brett_lamy\/docstream-editor$/,
        replacement: path.resolve(workspaceRoot, "packages/docstream-editor/src/index.ts"),
      },
    ],
  },
  server: {
    fs: {
      allow: [workspaceRoot],
    },
  },
  build: {
    outDir: path.resolve(workspaceRoot, "dist/apps/blamy-notes"),
    emptyOutDir: true,
  },
})
