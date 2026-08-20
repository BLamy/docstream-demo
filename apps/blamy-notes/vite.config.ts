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
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      {
        find: /^@brett_lamy\/docstream$/,
        replacement: path.resolve(workspaceRoot, "packages/docstream/src/index.ts"),
      },
      {
        find: /^@brett_lamy\/docstream\/assets$/,
        replacement: path.resolve(workspaceRoot, "packages/docstream/src/assets.ts"),
      },
      {
        find: /^@brett_lamy\/docstream\/gitbook$/,
        replacement: path.resolve(workspaceRoot, "packages/docstream/src/gitbook/index.ts"),
      },
      {
        find: /^@brett_lamy\/docstream\/openapi$/,
        replacement: path.resolve(workspaceRoot, "packages/docstream/src/openapi/OpenApiOperation.tsx"),
      },
      {
        find: /^@brett_lamy\/docstream\/playground$/,
        replacement: path.resolve(workspaceRoot, "packages/docstream/src/playground/index.ts"),
      },
      {
        find: /^@brett_lamy\/docstream\/replay$/,
        replacement: path.resolve(workspaceRoot, "packages/docstream/src/replay/index.ts"),
      },
      {
        find: /^@brett_lamy\/docstream\/source$/,
        replacement: path.resolve(workspaceRoot, "packages/docstream/src/source/index.ts"),
      },
      {
        find: /^@brett_lamy\/docstream\/video$/,
        replacement: path.resolve(workspaceRoot, "packages/docstream/src/video/index.ts"),
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
