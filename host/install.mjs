// pnpm install-host <extension id>  -> registers the native host for that extension only
// pnpm uninstall-host                -> removes the manifest and the wrapper
// Chrome launches hosts with a minimal PATH, so the wrapper pins the absolute node that ran this script.
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const NAME = 'com.hoan.refit_sidecar' // keep in sync with HOST in src/host.ts
const HERE = dirname(fileURLToPath(import.meta.url))
const DIR = join(homedir(), 'Library/Application Support/Google/Chrome/NativeMessagingHosts')
const MANIFEST = join(DIR, `${NAME}.json`)
const WRAPPER = join(HERE, 'refit-sidecar-host')

if (process.argv[2] === '--uninstall') {
  rmSync(MANIFEST, { force: true })
  rmSync(WRAPPER, { force: true })
  console.log(`Removed ${MANIFEST}\nRemoved ${WRAPPER}`)
  process.exit(0)
}

const id = process.argv[2] ?? ''
if (!/^[a-p]{32}$/.test(id)) {
  console.error('Usage: pnpm install-host <extension id>\nThe id is 32 letters a-p, shown on the extension card in chrome://extensions.')
  process.exit(1)
}
// The PATH symlink (e.g. /opt/homebrew/bin/node) survives upgrades; process.execPath is the versioned Cellar path.
const NODE = (process.env.PATH ?? '').split(':').map(d => join(d, 'node')).find(p => existsSync(p)) ?? process.execPath
for (const p of [NODE, HERE]) if (/["$`\\]/.test(p)) { console.error(`Unsupported characters in path: ${p}`); process.exit(1) }

writeFileSync(WRAPPER, `#!/bin/sh\nexec "${NODE}" "${join(HERE, 'host.mjs')}" "$@"\n`)
chmodSync(WRAPPER, 0o755)
mkdirSync(DIR, { recursive: true })
writeFileSync(MANIFEST, JSON.stringify({
  name: NAME,
  description: 'Refit Sidecar terminal host',
  path: WRAPPER,
  type: 'stdio',
  allowed_origins: [`chrome-extension://${id}/`],
}, null, 2) + '\n')
console.log(`Wrote ${MANIFEST}\nWrote ${WRAPPER} (node at ${NODE})\nReload the extension, then open app.refit.ai. Log: ~/Library/Logs/refit-sidecar.log`)
