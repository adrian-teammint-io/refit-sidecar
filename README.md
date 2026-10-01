# Refit Sidecar

Chrome extension for app.refit.ai: a drawer that lists failed `sync_request` rows from prod. You keep `pnpm server` open in a terminal. Clicking **Fetch FAIL syncs** in the drawer runs the command in that terminal, which prints it live and streams the output back into the drawer. Agent/dev docs live in [AGENTS.md](AGENTS.md).

## Setup

1. `pnpm install && pnpm build`
2. `chrome://extensions` → Developer mode → **Load unpacked** → pick `dist/`. Copy the extension id.
3. `pnpm install-host <extension id>` (once: registers the small relay Chrome uses to reach your terminal)
4. `pnpm server` and leave that terminal open
5. Open app.refit.ai, click the `>_` tab on the right edge, then **Fetch FAIL syncs**.

Requires the Tabularis app (`/Applications/tabularis.app`) with the refit-prod connection saved; the query runs through `tabularis --mcp`, so no DB credentials live in this repo.
