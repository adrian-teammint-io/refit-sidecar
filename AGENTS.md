# Refit Sidecar

Chrome MV3 extension for app.refit.ai that runs allowlisted commands in a terminal you keep open (`pnpm server`) and shows their output on the page. Commands (all read-only SELECTs on prod through Tabularis):
- `projects`: every project with its connection count, FAIL count and last sync (about 3s)
- `project-connections <project uuid>`: one project's connections, each with its newest sync_request (about 4s)
- `failed-syncs`: every `sync_request` with status `FAIL` UI and conventions are copied from `~/personal-projects/claude-sidecar`.

Surfaces:
1. **Drawer**, injected into app.refit.ai (closed shadow DOM). It is a stack of views (`content/App.tsx`), and Back or Esc pops one:
   - **Home**: the command list (`Projects`, `Failed syncs`), each with its cached summary.
   - **Projects**: search box (every word must match name, id or plan) + Active/Paused filter over the cached list. It auto-loads on first open; Refresh re-runs. Clicking a project pushes:
   - **Project**: its connections (failing first) with last sync status, reason, FAIL count and a link to each connection, plus **Open in Refit** (`app.refit.ai/<project id>`). Cached per project.
   - **Failed syncs**: parsed failed-sync cards; **Fetch FAIL syncs** runs it.
   - **Output**: the raw terminal of the last run, from the header's `>_` button in any view.
   - Launcher with the failed count, and a toast when a run started from this tab finishes.
2. **Toolbar icon + popup**: last run summary (count, exit status, duration), the 4 newest failures, raw output, settings. Badge = failed count (red), `!` (amber) when the native host isn't installed.
3. **Settings page**: native host setup with this extension's id filled in, plus live server status.

## Commands (pnpm)

| Command | What it does |
|---|---|
| `pnpm dev` | Watch-build into `dist/` (load `dist/` unpacked, hit reload in `chrome://extensions`) |
| `pnpm build` | Typecheck + production build |
| `pnpm server` | **The terminal server.** Keep it open: it runs the commands, prints every run live, and streams output back to the page |
| `pnpm test` | Assert checks: `src/term.test.ts`, `src/failed-syncs.test.ts`, `host/host.test.mjs` (drives the real relay + server) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm install-host <extension id>` | Writes the wrapper `host/refit-sidecar-host` and `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.hoan.refit_sidecar.json` (`allowed_origins` = this id only) |
| `pnpm uninstall-host` | Removes both |
| `pnpm package` | Build + zip to `releases/` |

The version lives only in `package.json`; the build writes it into `dist/manifest.json`.

## Architecture

```
drawer / popup ──call(req)──▶ worker (background.ts + host.ts) ──connectNative──▶ host/host.mjs (relay, Chrome starts it)
      ▲                            │ writes                                                │ unix socket ~/.refit-sidecar.sock (0600)
      └──── storage.onChanged ◀────┘ local: settings, run, failedSyncs                     ▼
                                     session: host, output              host/server.mjs  (`pnpm server`, your terminal)
                                                                          └─spawn, no shell─▶ node tabularis-query.mjs ─▶ tabularis --mcp ─▶ refit-prod
```

- **The worker owns the only port.** Surfaces never talk to the host. They send `call({type: 'run' | 'cancel' | 'hostStatus' | 'openOptions'})` and render from storage. `storage.session` is opened to content scripts with `setAccessLevel` in `background.ts`.
- **Why a relay + unix socket, not a localhost HTTP server**: any web page can try to reach a localhost port, but a browser cannot reach a unix socket. Chrome only lets this extension's id start the relay (`allowed_origins`), and the socket is mode 0600, so only your user can open it.
- **Protocol** (Chrome's 4-byte little-endian length + JSON; the same framing is reused on the socket, and the relay forwards frames unchanged):
  - Requests: `{id, type: 'hello'}`, `{id, type: 'run', command, args}`, `{id, type: 'cancel'}`
  - Replies: `{id, hello: {commands, log}}`, streamed `{id, stream: 'stdout'|'stderr', chunk}`, then `{id, exit, signal?, ms}`. Rejections are `{id, error}`.
  - Relay → worker, unsolicited: `{id: 'status', server: 'up' | 'down'}` whenever the terminal server appears or goes away (the relay retries the socket every 1s). On `up`, the worker sends `hello` to get the command list. While the server is down, the relay rejects runs with a "start pnpm server" error.
  - `hello` is an addition to the original spec: it lists the server's commands.
- **Chunking**: the server sends whole lines in chunks of at most 64K chars (`MAX_CHUNK` in `protocol.mjs`). That keeps every message under Chrome's 1 MB host → extension limit even when every character is JSON-escaped. A partial line is flushed after 100 ms idle or at stream end.
- **Results** (`storage.local`): `failedSyncs`, `projects`, `projectConnections` (project id → last fetch, newest `MAX_CACHED_PROJECTS` kept). A failed run keeps the last good rows and adds `error`.
- **One command at a time**: a view that auto-loads while another command runs shows "Waiting: … is running" and retries when that run ends.
- **Output buffer**: the worker strips ANSI and handles `\r` redraws (`term.ts`). It keeps the last `MAX_LINES` (2000) lines and counts the dropped ones, and writes `output` to `storage.session` at most every 120 ms. Raw stdout (up to 8 MB) is kept separately for the parser.
- **Lifecycle** (`HostState` in `api.ts`):
  - `offline`: relay up, no `pnpm server` running. Flips to `ready` by itself when the server starts, and back when it stops (Ctrl+C).
  - If the relay port disconnects, `lastError` sets the state: `not found` → `missing`, `forbidden` → `forbidden` (the manifest is for another id), anything else → `down` (retried with backoff 1s → 60s).
  - Every surface mount sends `hostStatus`, which reconnects.
  - A run in progress when the server or relay goes away ends with `error`.
  - A worker restart closes an orphaned `run` (`closeOrphanRun`).
  - When a relay disconnects, the server kills the process group of any run that relay started.
  - Only one server per socket: a second `pnpm server` exits. A stale socket left by a crash is replaced.

## Security rules (non-negotiable)

- The server only runs entries in `host/commands.json`. The relay runs nothing. Each entry has:
  - `exec`: `"node"` (the host's own node) or an absolute path
  - `args`: fixed strings; a whole-arg `"{param}"` is the only substitution
  - `params: {name: {pattern, default?}}`: values must be strings fully matching `^(?:pattern)$`; unknown params are rejected
  - `timeoutMs`
- `spawn(..., {shell: false})` always. Never build a shell string, never pass page text into a command.
- Nothing from app.refit.ai's page becomes a command or argument; the drawer reads nothing from the page today. Data from the DB is rendered as text, and `connectionUrl()` only builds links from UUID-shaped ids.
- `tabularis-query.mjs` refuses SQL that isn't a single `SELECT`/`WITH`. Tabularis connects as `postgres` (superuser), so the fixed SQL file is the real guard. Use a read-only DB role if queries ever become editable.
- **Ask Hoàn before adding any command that writes, deletes or touches the network** (DB reads included).

## Adding a command

1. Add an entry to `host/commands.json` (edits apply on the next run; no reinstall needed). For a query: a `sql/*.sql` file run by `tabularis-query.mjs`.
   - Tabularis has no bind parameters. The only placeholder is a quoted `':project_id'`, filled by `bindUuid()` (protocol.mjs) with a strict UUID. Declare the param with a UUID `pattern` too, so the server rejects bad input before spawning.
   - For another kind of value, extend `bindUuid` into a name → validator map. Never splice free text into SQL.
2. Add its name to `Command` in `src/api.ts`.
3. Parse: write a pure parser with `parseTable()` (`src/table.ts`, which looks columns up by name, turns `""` into null for nullable columns, and checks numbers) plus a `*.test.ts` against captured output in `src/samples/`. Store the result in `storeResult()` in `src/host.ts`, under its own `storage.local` key, and add that key to `KEYS` in `shared/store.ts`.
4. UI: add a view in `content/views.tsx` and a row on `Home`, add the view to `View` and `REFRESH` in `content/App.tsx`, then add a fixture and nav mode to `.claude/skills/ui-verify/stub.js` and screenshot.

## Codebase structure

```
host/
  server.mjs            `pnpm server`: unix socket server, allowlist, spawn, stream, cancel, live terminal output
  host.mjs              native messaging relay: Chrome stdio <-> unix socket, reports server up/down
  protocol.mjs          pure: socket path, framing, chunking, argv building (tested in host.test.mjs)
  tabularis-query.mjs   one SELECT through `tabularis --mcp` (JSON-RPC over stdio); prints result JSON to stdout, progress to stderr
  commands.json         the allowlist
  sql/                  failed-syncs.sql, projects.sql, project-connections.sql (':project_id' placeholder)
  install.mjs           install-host / uninstall-host
public/manifest.json    MV3 manifest (nativeMessaging, content script on https://app.refit.ai/*)
src/
  api.ts                Req union + call(), HostState / Run / Output types
  background.ts         worker: message router, badge
  host.ts               worker: connectNative port, run lifecycle, output buffer, failedSyncs parse/store
  term.ts               pure: ANSI strip, line splitting, line cap, durations, run status
  table.ts              pure: Tabularis {columns, rows} reader shared by all parsers
  failed-syncs.ts       pure: failed-syncs parser, connection/project URLs, labels
  projects.ts           pure: projects + project-connections parsers, project search, per-project cache cap
  samples/              captured command output for parser tests
  themes.ts ui.css      design system (copied from claude-sidecar; Settings = theme, mode, badge)
  shared/               controls, icons, store (useStore/useDark/useNow), Terminal, SyncList, HostSetup
  content/              drawer: main.tsx (shadow root), App.tsx (view stack, header), views.tsx (Home, Projects, Project, Failed), Settings.tsx, styles.css
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
