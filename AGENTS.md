# Refit Sidecar

Chrome MV3 extension for app.refit.ai that runs allowlisted commands on this Mac and shows their output. For now there is one command, `failed-syncs`, which lists every prod `sync_request` with status `FAIL`. UI and conventions are copied from `~/personal-projects/claude-sidecar`.

Surfaces:
1. **Drawer**, injected into app.refit.ai (closed shadow DOM): Results (parsed failed-sync cards with a link to each connection page) and Output (raw terminal). Run / Cancel, launcher with a count badge, toast when a run started here finishes.
2. **Toolbar icon + popup**: last run summary (count, exit status, duration), the 4 newest failures, raw output, settings. Badge = failed count (red), `!` (amber) when the host isn't installed.
3. **Settings page**: native host setup with this extension's id filled in, plus live host status.

## Commands (pnpm)

| Command | What it does |
|---|---|
| `pnpm dev` | Watch-build into `dist/` (load `dist/` unpacked, hit reload in `chrome://extensions`) |
| `pnpm build` | Typecheck + production build |
| `pnpm test` | Assert checks: `src/term.test.ts`, `src/failed-syncs.test.ts`, `host/host.test.mjs` (drives the real host over stdio) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm install-host <extension id>` | Writes the wrapper `host/refit-sidecar-host` and `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.hoan.refit_sidecar.json` (`allowed_origins` = this id only) |
| `pnpm uninstall-host` | Removes both |
| `pnpm package` | Build + zip to `releases/` |

The version lives only in `package.json`; the build writes it into `dist/manifest.json`.

## Architecture

```
drawer / popup ──call(req)──▶ worker (background.ts + host.ts) ──connectNative──▶ host/host.mjs ──spawn──▶ allowlisted command
      ▲                            │ writes                                          (no shell)          e.g. node tabularis-query.mjs
      └──── storage.onChanged ◀────┘ local: settings, run, failedSyncs                                         └─▶ tabularis --mcp ─▶ refit-prod
                                     session: host, output
```

- **The worker owns the only port.** Surfaces never talk to the host. They send `call({type: 'run' | 'cancel' | 'hostStatus' | 'openOptions'})` and render from storage. `storage.session` is opened to content scripts with `setAccessLevel` in `background.ts`.
- **Protocol** (Chrome's 4-byte little-endian length + JSON over stdio):
  - Requests: `{id, type: 'hello'}`, `{id, type: 'run', command, args}`, `{id, type: 'cancel'}`
  - Replies: `{id, hello: {commands, log}}`, streamed `{id, stream: 'stdout'|'stderr', chunk}`, then `{id, exit, signal?, ms}`. Rejections are `{id, error}`.
  - `hello` is an addition to the original spec: it tells the worker the host is up and lists its commands.
- **Chunking**: the host sends whole lines in chunks of at most 64K chars (`MAX_CHUNK` in `protocol.mjs`). That keeps every message under Chrome's 1 MB host → extension limit even when every character is JSON-escaped. A partial line is flushed after 100 ms idle or at stream end.
- **Output buffer**: the worker strips ANSI and handles `\r` redraws (`term.ts`). It keeps the last `MAX_LINES` (2000) lines and counts the dropped ones, and writes `output` to `storage.session` at most every 120 ms. Raw stdout (up to 8 MB) is kept separately for the parser.
- **Lifecycle**:
  - On disconnect, `lastError` sets the state: `not found` → `missing`, `forbidden` → `forbidden` (the manifest is for another id), anything else → `down` (retried with backoff 1s → 60s).
  - Every surface mount sends `hostStatus`, which reconnects.
  - A run in progress when the host dies ends with `error`.
  - A worker restart closes an orphaned `run` (`closeOrphanRun`).
  - The host kills its children's process group when Chrome closes stdin.
- **Log**: the host appends every run (argv, output, exit) to `~/Library/Logs/refit-sidecar.log`. `tail -f` it to watch from a terminal.

## Security rules (non-negotiable)

- The host only runs entries in `host/commands.json`. Each entry has:
  - `exec`: `"node"` (the host's own node) or an absolute path
  - `args`: fixed strings; a whole-arg `"{param}"` is the only substitution
  - `params: {name: {pattern, default?}}`: values must be strings fully matching `^(?:pattern)$`; unknown params are rejected
  - `timeoutMs`
- `spawn(..., {shell: false})` always. Never build a shell string, never pass page text into a command.
- Nothing from app.refit.ai's page becomes a command or argument; the drawer reads nothing from the page today. Data from the DB is rendered as text, and `connectionUrl()` only builds links from UUID-shaped ids.
- `tabularis-query.mjs` refuses SQL that isn't a single `SELECT`/`WITH`. Tabularis connects as `postgres` (superuser), so the fixed SQL file is the real guard. Use a read-only DB role if queries ever become editable.
- **Ask Hoàn before adding any command that writes, deletes or touches the network** (DB reads included).

## Adding a command

1. Add an entry to `host/commands.json`. Edits apply on the next run; no reinstall needed.
2. Add its name to `Command` in `src/api.ts`.
3. If the UI should show parsed results: write a pure parser module plus `*.test.ts` against captured output in `src/samples/`, call it from `finish()` in `src/host.ts`, and store the result under its own `storage.local` key.
4. Add a fixture to `.claude/skills/ui-verify/stub.js` and screenshot.

## Codebase structure

```
host/
  host.mjs              native host: allowlist, spawn, stream, cancel, log
  protocol.mjs          pure: framing, chunking, argv building (tested in host.test.mjs)
  tabularis-query.mjs   one SELECT through `tabularis --mcp` (JSON-RPC over stdio); prints result JSON to stdout, progress to stderr
  commands.json         the allowlist
  sql/failed-syncs.sql  FAIL rows joined to connection, project, service_connection
  install.mjs           install-host / uninstall-host
public/manifest.json    MV3 manifest (nativeMessaging, content script on https://app.refit.ai/*)
src/
  api.ts                Req union + call(), HostState / Run / Output types
  background.ts         worker: message router, badge
  host.ts               worker: connectNative port, run lifecycle, output buffer, failedSyncs parse/store
  term.ts               pure: ANSI strip, line splitting, line cap, durations, run status
  failed-syncs.ts       pure: parser, connection URL, labels
  samples/              captured command output for parser tests
  themes.ts ui.css      design system (copied from claude-sidecar; Settings = theme, mode, badge)
  shared/               controls, icons, store (useStore/useDark/useNow), Terminal, SyncList, HostSetup
  content/              drawer: main.tsx (shadow root), App.tsx, Settings.tsx, styles.css
  popup/                main.tsx, PopupSettings.tsx, popup.css
  options.tsx           settings page (host setup)
.claude/skills/         ui-system, ui-verify
```

- Two Vite builds: `vite.config.ts` (options, popup, worker as ES modules) and `vite.content.config.ts` (content script as one IIFE, fonts inlined).
- Connection link: `https://app.refit.ai/{project_id}/datasources/{service|file}/{connection_id}` (refit-app-2 route `/_auth/$projectId/datasources/service/$datasourceId`, where datasourceId = `connection.id`).
- Popup must stay ≤ 600px tall: `H=600 bash .claude/skills/ui-verify/shoot.sh popup many`.

## UI system

Same as claude-sidecar. Full guide in the `ui-system` skill. Tokens come from `themes.ts` on `.root`, shared primitives and components live in `ui.css`, and the fonts are Geist + JetBrains Mono. Motion is ease-out, ≤ 300ms, exact transition properties, and every stylesheet has a reduced-motion block.

## Conventions

- Keep it small: no new dependencies for what a few lines do. Mark deliberate shortcuts with `// ponytail:` and name the ceiling.
- Pure logic goes in a chrome-free module with an assert test next to it (`*.test.ts`, run by `pnpm test`).
- Effects use block bodies: `useEffect(() => { x() }, [])`.
- Commits: conventional title (`feat(host): ...`) + bullet body, no emojis, no AI attribution.
- Shell hooks:
  - A PreToolUse hook treats the first line of any heredoc (or the text after `-m`) as a commit message. Write files with the editor.
  - Another hook blocks commands that mention `dist`, `build` or `node_modules` as path words unless the command starts with `npm run build`. Use `npm run build --prefix <repo>`.
- Use AGENTS.md for agent docs, not CLAUDE.md.

## Skills (load when relevant)

- `.claude/skills/ui-system`: building or restyling any UI surface
- `.claude/skills/ui-verify`: screenshot the drawer or popup without loading the extension
