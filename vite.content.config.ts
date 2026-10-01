import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': '"production"' },
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    // ponytail: fonts inlined as data URIs so the content script needs no web_accessible_resources
    assetsInlineLimit: 1_000_000,
    lib: { entry: 'src/content/main.tsx', formats: ['iife'], name: 'RefitSidecar', fileName: () => 'content.js' },
  },
})
