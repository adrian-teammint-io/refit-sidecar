# Refit Sidecar

Chrome extension for app.refit.ai: a drawer that lists failed `sync_request` rows from prod. Clicking **Run** in the drawer runs a local command on your Mac through a native messaging host, and its output streams back into the drawer. Agent/dev docs live in [AGENTS.md](AGENTS.md).

## Setup

1. `pnpm install && pnpm build`
2. `chrome://extensions` → Developer mode → **Load unpacked** → pick `dist/`. Copy the extension id.
3. `pnpm install-host <extension id>`
4. Open app.refit.ai and click the `>_` tab on the right edge.

Requires the Tabularis app (`/Applications/tabularis.app`) with the refit-prod connection saved; the query runs through `tabularis --mcp`, so no DB credentials live in this repo. Watch runs from a terminal with `tail -f ~/Library/Logs/refit-sidecar.log`.
