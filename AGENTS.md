# Refit Sidecar

Chrome MV3 extension for app.refit.ai and staging-app.refit.ai that runs allowlisted commands in a terminal you keep open (`pnpm server`) and shows their output on the page. Every command takes `env` (`prod` | `stag`, default `prod`), which `tabularis-query.mjs` maps to a Tabularis connection (`CONNECTIONS` in protocol.mjs: REFIT_ PROD / REFIT_STAG). All commands are SELECTs except the two writes, `delete-syncs` and `add-project-user`:
- `projects q status sort offset`: projects with connection count, FAIL count and last sync; sort `active` (active first, default) / `name` / `recent`
- `project-connections project_id q sort offset`: one project's connections, each with its newest sync_request; sort `status` (failing first) / `service` / `name`
- `connections q offset`: connections across every project, matched on name, service or id
- `fitting-rooms q offset`: fitting rooms (pipelines), newest edit first, matched on name, project name or id
- `failed-syncs`: every `sync_request` with status `FAIL`
- `project-members project`: a project's members from `refit_user_project_relation` + `refit_user` (email, name, role, added), admins first
- `user-search project q`: up to 10 existing `refit_user`s whose email or name contains q (at least 2 characters), with their role in this project if they're already a member
- `delete-syncs ids`: **write.** Deletes 1-100 sync_requests by id, only those still `FAIL`, `RETURNING id` (the drawer version of fish `refit-sync_delete`).
- `add-project-user user project role`: **write.** Inserts `refit_user_project_relation (user_id, project_id, role)` with role `viewer` / `editor` / `admin`, the same row refit-app-2's admin ProjectMembersModal inserts. `ON CONFLICT DO NOTHING RETURNING`: an existing member is never changed (the app's own mutation would update their role). Only existing users; there's no invite or email.

Both writes are blocked by Tabularis read-only mode until Hoàn approves them in the Tabularis app, so they wait up to 5 min. Neither queues: the worker refuses a write while another command runs (`WRITES` in `src/host.ts`). Queries never select `refit_user.pwd` or tokens.

The four browse commands return batches of 30 (`BATCH` in `src/projects.ts`; the SQL asks for `LIMIT 31` and the extra row only means "there is more"). Each takes about 1s. UI and conventions are copied from `~/personal-projects/claude-sidecar`.

Surfaces:
1. **Drawer**, injected into app.refit.ai and staging-app.refit.ai (closed shadow DOM). It is a stack of views (`content/App.tsx`), and Back or Esc pops one. Drag its left edge (or focus the edge and use arrow keys) to resize, 360 to 1200px. Double-click the edge to reset to 440. The width is saved in `settings.drawerWidth`.
   - **Home**: Search (`Projects`, `Connections`, `Fitting rooms`), Checks (`Failed syncs`, with its count), then pinned projects.
   - **Projects**: server-side search (debounced 300ms), a status filter, and a sort (Active first / Name / Recent sync). Pinned projects matching the search are listed first. Click the pin icon to pin or unpin. Clicking a project pushes:
   - **Project**: pin, **Open in Refit** (`app.refit.ai/<project id>`), then a Connections | Members switch.
     - Connections: search and sort (Failing first / Service / Name). Sort by service adds a header per platform. Cached per project.
     - Members (`content/members.tsx`): the member list (auto-loads once, refresh in the status line), and **Add user**: search existing users by email or name (debounced), pick one (members are shown as `member · role` and can't be picked), choose a role (Viewer default), then confirm with a PROD/STAG tag. On prod you type the email's part before `@` to enable Add. After it finishes, the toast says "Added as viewer" or "Already a member; nothing changed", the form closes and the list reloads. Esc closes the form first. There's no Refit page to link to: the app's member UI is a modal under `/admin/projects` with no URL.
   - **Connections** / **Fitting rooms**: search everything. Each card links to Refit, and its project name opens that project's view.
   - **Failed syncs** (`content/failed.tsx`): parsed failed-sync cards, each with **Open in Refit** in its foot; **Fetch FAIL syncs** runs it. Delete hides behind **Select**: cards get a round check (clicking the card toggles it; selected = accent border + ring, red only on Delete), and a sticky bulk bar shows the count, **Select all** (first 100) / **Clear**, and **Delete N**. Delete expands that bar in place into the confirm: PROD/STAG tag, a preview of the rows, and on prod the count typed back before Delete is enabled. Back or Esc closes it. A delete never queues: it's refused while another command runs. Deleted rows (from `RETURNING id`) drop out of the list; if Tabularis doesn't return them, the list is fetched again. The toast and status pill show `run.summary` ("Deleted 3 of 3 …").
   - **Staging**: on staging-app.refit.ai the drawer is `ENV = 'stag'` (`src/table.ts`, from `location.hostname`), shows an amber **STAG** chip in the header, sends `env: 'stag'` with every command, and links to staging-app.refit.ai.
   - **Output**: the raw terminal of the last run, from the header's `>_` button in any view.
   - Every browse view has a status line (count, refresh, cancel) and **Load 30 more**. Rows dim while a new query loads.
   - Launcher with the failed count, and a toast when a run started from this tab finishes.
2. **Toolbar icon + popup**: last run summary (count, exit status, duration), the 4 newest failures, raw output, settings. Badge = failed count (red), `!` (amber) when the native host isn't installed.
3. **Settings page**: native host setup with this extension's id filled in, plus live server status.

## Commands (pnpm)

| Command | What it does |
|---|---|
| `pnpm dev` | Watch-build into `dist/` (load `dist/` unpacked, hit reload in `chrome://extensions`) |
| `pnpm build` | Typecheck + production build |
| `pnpm server` | **The terminal server.** Keep it open: it runs the commands, prints every run live, and streams output back to the page |
| `pnpm test` | Assert checks: `src/term.test.ts`, `src/failed-syncs.test.ts`, `src/projects.test.ts`, `host/host.test.mjs` (drives the real relay + server) |
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
                                                                          └─spawn, no shell─▶ node tabularis-query.mjs ─▶ tabularis --mcp ─▶ REFIT_ PROD | REFIT_STAG
```

- **The worker owns the only port.** Surfaces never talk to the host. They send `call({type: 'run' | 'cancel' | 'hostStatus' | 'openOptions'})` and render from storage. `storage.session` is opened to content scripts with `setAccessLevel` in `background.ts`.
- **Why a relay + unix socket, not a localhost HTTP server**: any web page can try to reach a localhost port, but a browser cannot reach a unix socket. Chrome only lets this extension's id start the relay (`allowed_origins`), and the socket is mode 0600, so only your user can open it.
- **Protocol** (Chrome's 4-byte little-endian length + JSON; the same framing is reused on the socket, and the relay forwards frames unchanged):
  - Requests: `{id, type: 'hello'}`, `{id, type: 'run', command, args}`, `{id, type: 'cancel'}`
  - Replies: `{id, hello: {commands, log}}`, streamed `{id, stream: 'stdout'|'stderr', chunk}`, then `{id, exit, signal?, ms}`. Rejections are `{id, error}`.
  - Relay → worker, unsolicited: `{id: 'status', server: 'up' | 'down'}` whenever the terminal server appears or goes away (the relay retries the socket every 1s). On `up`, the worker sends `hello` to get the command list. While the server is down, the relay rejects runs with a "start pnpm server" error.
  - `hello` is an addition to the original spec: it lists the server's commands.
- **Chunking**: the server sends whole lines in chunks of at most 64K chars (`MAX_CHUNK` in `protocol.mjs`). That keeps every message under Chrome's 1 MB host → extension limit even when every character is JSON-escaped. A partial line is flushed after 100 ms idle or at stream end.
- **Results** (`storage.local`): `failedSyncs`, plus pages `{at, runId, query, rows, hasMore}` for `projects`, `connections` and `fittingRooms`, and for `projectConnections` (by project id, newest `MAX_CACHED_PROJECTS` kept). `mergePage()` appends a run of the same query at the next offset; any other query replaces the page. `pins` holds a project snapshot per pinned id, refreshed whenever that project comes back in a result. A failed run keeps the last good rows and adds `error`. Results are per environment: prod uses these key names (the popup and badge only read prod), staging stores `stag.<key>` (`envKey()`, `DATA_KEYS` in `src/table.ts`). The worker writes under the run's `args.env`; `useStore` reads the tab's `ENV`. `settings`, `run`, `host` and `output` are shared, and a run only counts as a view's own (`runMatches`) when its env matches the tab.
- **One command at a time, latest wins** (`startRun` in `host.ts`): while a run is going, the newest request waits, replacing any older waiting one. A request for the *same* command cancels the running one and discards its result, so a search box never waits behind a stale query. `finish()` starts the waiting request. The status line shows "Queued after …".
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
- Nothing from app.refit.ai's page becomes a command or argument; the drawer reads nothing from the page. The only page-derived input is `location.hostname` (the origin, which a page can't fake) choosing `env`, and the host's `env` pattern only allows `prod|stag`. Data from the DB is rendered as text, and `connectionUrl()` only builds links from UUID-shaped ids. Delete ids come from rows the DB returned and must be UUIDs (`PARAMS.ids`).
- `tabularis-query.mjs` runs `checkQuery()` (protocol.mjs): a single `SELECT`/`WITH`, or a write listed in `WRITES`, which maps a SQL file to the exact statement shape it must have (`sql/delete-syncs.sql`: `DELETE FROM sync_request WHERE status = 'FAIL' AND id IN ('<uuid>', …) RETURNING id`; `sql/add-project-user.sql`: `INSERT INTO refit_user_project_relation (user_id, project_id, role) VALUES ('<uuid>', '<uuid>', '<role>') ON CONFLICT (project_id, user_id) DO NOTHING RETURNING user_id, role`). Tabularis connects as `postgres` (superuser), so these fixed files plus Tabularis's own read-only mode and approval prompt are the guard.
- **Ask Hoàn before adding any command that writes, deletes or touches the network** (DB reads included), and before adding anything to `WRITES`.
- **Never run `tabularis-query.mjs` or any write command to test, not even with a fake binary.** Test guards as pure functions in `host/host.test.mjs`.

## Adding a command

1. Add an entry to `host/commands.json` (edits apply on the next run; no reinstall needed). For a query: a `sql/*.sql` file run by `tabularis-query.mjs`, with `"{env}"` as its connection arg and an `env` param (`prod|stag`, default `prod`); host.test.mjs checks every entry has both.
   - Tabularis has no bind parameters. SQL files use unquoted typed placeholders, filled by `bindParams()` (`PARAMS` in protocol.mjs): `:project_id` / `:user_id` (strict UUID), `:ids` (1-100 UUIDs), `:offset` (int), `:status` / `:sort` / `:role` (enums), `:q` (hex of UTF-8 text, emitted as `convert_from(decode('…','hex'),'UTF8')`). Every placeholder needs a value and every value must be used. `tabularis-query.mjs` takes them as `--name value` pairs after the row limit. Declare each param in commands.json with a matching `pattern` too, so the server rejects bad input before spawning.
   - A new kind of value gets a new validator in `PARAMS`. Never splice free text into SQL.
   - Match search text with `strpos(lower(col), lower(:q)) > 0` (no LIKE wildcards to escape).
   - **Tabularis read-only mode is ON** for refit-prod and blocks whatever it thinks is a write. It flags `replace(` in larger queries, so never use `replace()` or backslash string literals in SQL files. Leading `--` comments are fine (`stripLeadingComments()`).
   - Batch queries: `LIMIT 31 OFFSET :offset`. `sync_request` has no index on `connection_id`, so aggregate it in one pass (DISTINCT ON / GROUP BY) instead of a per-row subquery.
   - **Never test a query against prod without asking Hoàn.** Verify with captured samples in `src/samples/`, `pnpm test` and `ui-verify`.
2. Add its name to `Command` in `src/api.ts`.
3. Parse: write a pure parser with `parseTable()` (`src/table.ts`, which looks columns up by name, turns `""` into null for nullable columns, and checks numbers) plus a `*.test.ts` against captured output in `src/samples/`. Store the result in `storeResult()` in `src/host.ts` through its `save()` (which keys it by the run's env), under its own key, and add that key to `DATA_KEYS` in `src/table.ts` and the `Store` type in `shared/store.ts`. Send `env: ENV` with the run (browse views get it from `useBrowse`).
4. UI: add a view in `content/views.tsx` and a row on `Home`, add the view to `View` and `TITLES` in `content/App.tsx` (a browse view: `useBrowse` + `Browse` from `content/browse.tsx`), then add a fixture and nav mode to `.claude/skills/ui-verify/stub.js` and screenshot.

## Codebase structure

```
host/
  server.mjs            `pnpm server`: unix socket server, allowlist, spawn, stream, cancel, live terminal output
  host.mjs              native messaging relay: Chrome stdio <-> unix socket, reports server up/down
  protocol.mjs          pure: socket path, framing, chunking, argv building, bindParams/PARAMS, CONNECTIONS, WRITES/checkQuery (tested in host.test.mjs)
  tabularis-query.mjs   one query through `tabularis --mcp` (JSON-RPC over stdio), env -> connection, checkQuery guard; result JSON to stdout, progress to stderr
  commands.json         the allowlist
  sql/                  failed-syncs.sql, projects.sql, project-connections.sql, connections.sql, fitting-rooms.sql, project-members.sql, user-search.sql; writes: delete-syncs.sql, add-project-user.sql
  install.mjs           install-host / uninstall-host
public/manifest.json    MV3 manifest (nativeMessaging, content script on https://app.refit.ai/* and https://staging-app.refit.ai/*)
src/
  api.ts                Req union + call(), HostState / Run / Output types
  background.ts         worker: message router, badge
  host.ts               worker: connectNative port, run lifecycle, output buffer, failedSyncs parse/store
  term.ts               pure: ANSI strip, line splitting, line cap, durations, run status
  table.ts              pure: Tabularis {columns, rows} reader shared by all parsers; ENV / APP / envKey (prod vs staging)
  failed-syncs.ts       pure: failed-syncs parser, connection/project/fitting-room URLs, labels
  projects.ts           pure: browse parsers, BATCH, query <-> args (hex q), mergePage, per-project cache cap, pins
  samples/              captured command output for parser tests
  themes.ts ui.css      design system (copied from claude-sidecar; Settings = theme, mode, badge)
  shared/               controls, icons, store (useStore per env/useDark/useNow), Terminal, SyncList (select mode, Open in Refit), HostSetup
  content/              drawer: main.tsx (shadow root), App.tsx (view stack, header, per-view query state), views.tsx (Home,
                        Projects, Project, Connections, FittingRooms), failed.tsx (Failed syncs + delete confirm), members.tsx (Members + Add user), browse.tsx (useBrowse, status line, load more, empty/skeleton),
                        resize.ts (left-edge drag), Settings.tsx, styles.css
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
