import { readFileSync, writeFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// package.json is the single source of truth for the version (`pnpm version patch` bumps it).
const manifestVersion: Plugin = {
  name: 'manifest-version',
  closeBundle() {
    const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
    const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'))
    writeFileSync('dist/manifest.json', JSON.stringify({ ...manifest, version }, null, 2))
  },
}

// Settings page + background worker. Content script is built separately (vite.content.config.ts)
// because content scripts can't be ES modules, so it needs its own single-file IIFE build.
export default defineConfig({
  plugins: [react(), manifestVersion],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: { options: 'options.html', popup: 'popup.html', background: 'src/background.ts' },
      output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name].js', assetFileNames: 'assets/[name][extname]' },
    },
  },
})
