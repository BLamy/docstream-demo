import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';

const external = ['react', 'react-dom', 'd3', 'katex'];

export default defineConfig({
  publicDir: false,
  plugins: [
    react(),
    dts({
      tsconfigPath: 'packages/viz-engine/tsconfig.json',
      entryRoot: 'packages/viz-engine/src',
      outDir: 'packages/viz-engine/dist',
      // Keep declarations as stable per-entry files. API Extractor cannot
      // resolve the legacy engine's re-export graph reliably yet.
      rollupTypes: false,
      insertTypesEntry: true,
      copyDtsFiles: true,
    }),
  ],
  build: {
    outDir: 'packages/viz-engine/dist',
    emptyOutDir: true,
    lib: {
      entry: {
        index: 'packages/viz-engine/src/index.ts',
        draw: 'packages/viz-engine/src/draw.ts',
        acts: 'packages/viz-engine/src/acts.ts',
        narrator: 'packages/viz-engine/src/narrator.ts',
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external,
    },
    sourcemap: true,
  },
});
