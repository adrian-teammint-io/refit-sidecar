# Refit Sidecar

> **Asked to change something?** Go to [Codebase structure → Where to edit](#where-to-edit) first: it maps each feature to its files, symbols and CSS section, so you can open the right file without searching. A new command follows [How a command flows](#how-a-command-flows-touch-these-in-order-for-a-new-one).

Chrome MV3 extension for app.refit.ai and staging-app.refit.ai that runs allowlisted commands in a terminal you keep open (`pnpm server`) and shows their output on the page. Every command takes `env` (`prod` | `stag`, default `prod`), which `tabularis-query.mjs` maps to a Tabularis connection (`CONNECTIONS` in protocol.mjs: REFIT_ PROD / REFIT_STAG). All commands are SELECTs except the three writes, `delete-syncs`, `add-project-user` and `create-project`:
- `projects q status sort offset`: projects with connection count, FAIL count and last sync; sort `active` (active first, default) / `name` / `recent`
- `project-connections project_id q sort offset`: one project's connections, each with its newest sync_request; sort `status` (failing first) / `service` / `name`
- `connections q offset`: connections across every project, matched on name, service or id
- `fitting-rooms q offset`: fitting rooms (pipelines), newest edit first, matched on name, project name or id
- `failed-syncs sync_status`: every `sync_request` with status `sync_status` (`FAIL` default / `IN_PROGRESS` / `FRAGMENTED`, newest 500), each with `recovered_*`: the newest later SUCCESS on the same connection covering its end_date (fish `refit-sync_success_after_fail` rule, one hash-joined pass)
- `project-members project`: a project's members from `refit_user_project_relation` + `refit_user` (email, name, role, added), admins first
- `user-search project q`: up to 10 existing `refit_user`s whose email or name contains q (at least 2 characters), with their role in this project if they're already a member
- `delete-syncs ids`: **write.** Deletes 1-100 sync_requests by id, only those still `FAIL`, `RETURNING id` (the drawer version of fish `refit-sync_delete`).
- `add-project-user user project role`: **write.** Inserts `refit_user_project_relation (user_id, project_id, role)` with role `viewer` / `editor` / `admin`, the same row refit-app-2's admin ProjectMembersModal inserts. `ON CONFLICT DO NOTHING RETURNING`: an existing member is never changed (the app's own mutation would update their role). Only existing users; there's no invite or email.
- `create-project name user status plan end members`: **write.** One `WITH … INSERT` statement, like refit-gql `add_project` (the welcome page's `createProject`): a `project` row (`name`, `create_by` = owner, `status` ACTIVE / PAUSED / NEED_PAYMENT, `plan` BASIC / DEMO / ENTERPRISE (no TRIAL), `end_date`), then one `INSERT … SELECT FROM p, (VALUES (owner, 'admin'), (uuid, role)…)` for the owner as admin plus each `uuid:role` member (`DO NOTHING` on duplicates). `RETURNING project_id, user_id`: one row per member added, so the toast's member count is the row count. Unlike the app it doesn't add refit-gql's 3 `REFIT_ADMIN` users; you pick members instead. Nothing else happens on create in Refit either (no triggers, billing or default rows).

All writes are blocked by Tabularis read-only mode until Hoàn approves them in the Tabularis app, so they wait up to 5 min. None queues: the worker refuses a write while another command runs (`WRITES` in `src/host.ts`). Queries never select `refit_user.pwd` or tokens.

The four browse commands return batches of 30 (`BATCH` in `src/projects.ts`; the SQL asks for `LIMIT 31` and the extra row only means "there is more"). Each takes about 1s. UI and conventions are copied from `~/personal-projects/claude-sidecar`.

Surfaces:
1. **Drawer**, injected into app.refit.ai and staging-app.refit.ai (closed shadow DOM). It is a stack of views (`content/App.tsx`), and Back or Esc pops one. The header shows the stack as breadcrumbs (Home › Projects › project); clicking one pops back to it, and ancestors shrink with an ellipsis before the current title does. Drag its left edge (or focus the edge and use arrow keys) to resize, 360 to 1200px. Double-click the edge to reset to 440. The width is saved in `settings.drawerWidth`.
   - **Home**: Search (`Projects`, `Connections`, `Fitting rooms`), Checks (`Sync requests`, with the FAIL count; the row turns red while there are failures), then pinned projects.
   - **Projects**: server-side search (debounced 300ms), a status filter, and a sort (Active first / Name / Recent sync). Pinned projects matching the search are listed first. Click the pin icon to pin or unpin. The header's **+** opens **New project** (`content/new-project.tsx`):
     - name, owner (picked from existing users), members with a role each (hoan@team-mint.io is looked up and pre-filled as admin, removable), plan, status and end date (default one month out)
     - warns when ACTIVE has an end date of today or earlier (billing / expiry picks it up)
     - a PROD/STAG confirm at the bottom; on prod you type the project name. On success the view is replaced by the new project's view.
     - `user-search` outside a project passes `NO_PROJECT` (the nil UUID), so nobody shows as an existing member.

     Clicking a project pushes:
   - **Project**: pin, **Open in Refit** (`app.refit.ai/<project id>`), then a Connections | Members switch.
     - Connections: search and sort (Failing first / Service / Name). Sort by service adds a header per platform. Cached per project. A card's **N FAIL total** link opens Sync requests filtered to that connection.
     - Header **N FAIL** chip: counted from the Sync requests FAIL list when that's loaded, complete and error-free, else the cached project row.
     - Members (`content/members.tsx`): the member list (auto-loads once, refresh in the status line), and **Add user**: search existing users by email or name (debounced), pick one (members are shown as `member · role` and can't be picked), choose a role (Viewer default), then confirm with a PROD/STAG tag. On prod you type the email's part before `@` to enable Add. After it finishes, the toast says "Added as viewer" or "Already a member; nothing changed", the form closes and the list reloads. Esc closes the form first. There's no Refit page to link to: the app's member UI is a modal under `/admin/projects` with no URL.
   - **Connections** / **Fitting rooms**: search everything. Each card links to Refit, and its project name opens that project's view.
   - **Connection cards** (project Connections tab and Connections search) take their FAIL count and reason box from `liveFails()` (`failed-syncs.ts`): when the Sync requests FAIL list is newer than the card's page (a refetch, or a delete dropping rows), its rows for that connection win, and FAILs a later SUCCESS covers are counted but show no reason; otherwise the page's values, with the reason only while the newest sync is FAIL (a resolved row can keep its old reason text). A truncated list can't prove "none", so then the page wins. The status pill always comes from the page.
   - They also have the same **Select** mode as Sync requests (the **Select** / **Done** toggle sits in the status line through `StatusLine`'s `tools` slot, next to Refresh / Cancel; the panel owns `selecting`), but the bulk bar's action is **Open N in Refit**: the worker opens each connection page in a background tab (`openTabs` in `background.ts`, at most `MAX_TABS` = 10, only URLs shaped like `connectionUrl()`). Deleting happens there, in Refit's own dialog. There's deliberately no connection delete in the drawer: refit-gql `delete_connection` (`db/api.py:1158-1256`) refuses if a fitting room uses the connection, deletes seed_data / data_source / column_definition(_action) / connection / column_selection / service_connection in order, and `DROP`s the seed view and the `{service}."{id}"` data table. A plain `DELETE FROM connection` fails on the RESTRICT FK from column_definition_action, or leaves those behind. If a real Delete button is wanted later, the proposed route is calling Refit's own `deleteServiceConnection` mutation with the logged-in user's session (Refit then does every check and cleanup). Not built: it means reading the user's token from the page, which breaks the "reads nothing from the page" rule below, so ask Hoàn first.
   - **Sync requests** (`content/failed.tsx`, view kind `failed`): status tabs **FAIL** (default) | **IN_PROGRESS** | **FRAGMENTED**, one `failed-syncs` command with a `sync_status` param (FAIL is stored in `failedSyncs`, which the popup and toolbar icon read; the others in `syncRequests[status]`; a never-fetched tab fetches on first open). Select / Delete only on FAIL. Parsed sync cards, each with **Open in Refit** in its foot and a green **Succeeded after** chip when a later SUCCESS on the same connection covers the FAIL's end_date (`recovered_*` columns in `failed-syncs.sql`, the fish `refit-sync_success_after_fail` rule); **Fetch** (then **Refetch**) runs it. Delete hides behind **Select**: cards get a round check (clicking the card toggles it; selected = accent border + ring, red only on Delete), and a sticky bulk bar shows the count, **Select all** (first 100) / **Clear**, and **Delete N**. Delete expands that bar in place into the confirm: PROD/STAG tag, a preview of the rows, and Delete (no typed count; Tabularis approval is the last gate). Back or Esc closes it. A delete never queues: it's refused while another command runs. Deleted rows (from `RETURNING id`) drop out of the list; if Tabularis doesn't return them, the list is fetched again. The toast and status pill show `run.summary` ("Deleted 3 of 3 …").
   - **Staging**: on staging-app.refit.ai the drawer is `ENV = 'stag'` (`src/table.ts`, from `location.hostname`), shows an amber **STAG** chip in the header, sends `env: 'stag'` with every command, and links to staging-app.refit.ai.
   - **No Output view**: the `pnpm server` terminal already prints every run live. A failed run keeps its last stderr line (`run.tail`, set in `finish()`), and the error banners and the failure toast show it ("Command failed (exit 1): run_query error: …"). `tabularis-query.mjs` prints Tabularis's log before its own error so that line is the reason.
   - Every browse view shows its cached page at once and, when that page is older than 30s (`MAX_AGE` in `browse.tsx`), fetches it again in the background (rows dim meanwhile; a refetch goes back to the first batch). It also has a status line (count, refresh, cancel) and **Load 30 more**, which also fires by itself when it scrolls into view (IntersectionObserver, once per batch, not after an error). Rows dim while a new query loads.
   - Launcher with the failed count, and a toast when a run started from this tab finishes.
   - **Keyboard shortcuts** (see [Keyboard shortcuts](#keyboard-shortcuts)): **R** refetches the current view; the footer shows the bound key.
2. **Toolbar icon + popup**: last run summary (count tinted red when > 0, "in N projects · newest Xm ago", exit status, duration), the 4 newest failures, raw output, settings. FAIL only. The toolbar icon itself is redrawn with the count (`countIcon()` in `background.ts`: OffscreenCanvas, red tile with the number, `99+` cap; amber `!` when the native host isn't installed; the normal icon otherwise or when the setting is off). No badge text.
3. **Settings page**: native host setup with this extension's id filled in, plus live server status.

## Commands (pnpm)

| Command | What it does |
|---|---|
| `pnpm dev` | Watch-build into `dist/` (load `dist/` unpacked, hit reload in `chrome://extensions`) |
| `pnpm build` | Typecheck + production build |
| `pnpm server` | **The terminal server.** Keep it open: it runs the commands, prints every run live, and streams output back to the page |
| `pnpm test` | Assert checks: `src/term.test.ts`, `src/failed-syncs.test.ts`, `src/projects.test.ts`, `src/keybinds.test.ts`, `host/host.test.mjs` (drives the real relay + server) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm install-host <extension id>` | Writes the wrapper `host/refit-sidecar-host` and `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.hoan.refit_sidecar.json` (`allowed_origins` = this id only) |
| `pnpm uninstall-host` | Removes both |
| `pnpm package` | Build + zip to `releases/` |

The version lives only in `package.json`; the build writes it into `dist/manifest.json`.

## Architecture

```
drawer / popup ──call(req)──▶ worker (background.ts + host.ts) ──connectNative──▶ host/host.mjs (relay, Chrome starts it)
      ▲                            │ writes                                                │ unix socket ~/.refit-sidecar.sock (0600)
      └──── storage.onChanged ◀────┘ local: settings, run, results per env (DATA_KEYS)    ▼
                                     session: host, output              host/server.mjs  (`pnpm server`, your terminal)
                                                                          └─spawn, no shell─▶ node tabularis-query.mjs ─▶ tabularis --mcp ─▶ REFIT_ PROD | REFIT_STAG
```

- **The worker owns the only port.** Surfaces never talk to the host. They send `call({type: 'run' | 'cancel' | 'hostStatus' | 'openOptions' | 'openTabs'})` and render from storage. `storage.session` is opened to content scripts with `setAccessLevel` in `background.ts`.
- **Why a relay + unix socket, not a localhost HTTP server**: any web page can try to reach a localhost port, but a browser cannot reach a unix socket. Chrome only lets this extension's id start the relay (`allowed_origins`), and the socket is mode 0600, so only your user can open it.
- **Protocol** (Chrome's 4-byte little-endian length + JSON; the same framing is reused on the socket, and the relay forwards frames unchanged):
  - Requests: `{id, type: 'hello'}`, `{id, type: 'run', command, args}`, `{id, type: 'cancel'}`
  - Replies: `{id, hello: {commands, log}}`, streamed `{id, stream: 'stdout'|'stderr', chunk}`, then `{id, exit, signal?, ms}`. Rejections are `{id, error}`.
  - Relay → worker, unsolicited: `{id: 'status', server: 'up' | 'down'}` whenever the terminal server appears or goes away (the relay retries the socket every 1s). On `up`, the worker sends `hello` to get the command list. While the server is down, the relay rejects runs with a "start pnpm server" error.
  - `hello` is an addition to the original spec: it lists the server's commands.
- **Chunking**: the server sends whole lines in chunks of at most 64K chars (`MAX_CHUNK` in `protocol.mjs`). That keeps every message under Chrome's 1 MB host → extension limit even when every character is JSON-escaped. A partial line is flushed after 100 ms idle or at stream end.
- **Results** (`storage.local`): `failedSyncs` (the FAIL fetch), `syncRequests` (`{IN_PROGRESS, FRAGMENTED}`, same shape), plus pages `{at, runId, query, rows, hasMore}` for `projects`, `connections` and `fittingRooms`, and for `projectConnections` (by project id, newest `MAX_CACHED_PROJECTS` kept). `mergePage()` appends a run of the same query at the next offset; any other query replaces the page. `pins` holds a project snapshot per pinned id, refreshed whenever that project comes back in a result. A failed run keeps the last good rows and adds `error`. Results are per environment: prod uses these key names (the popup and toolbar icon only read prod), staging stores `stag.<key>` (`envKey()`, `DATA_KEYS` in `src/table.ts`). The worker writes under the run's `args.env`; `useStore` reads the tab's `ENV`. `settings`, `run`, `host` and `output` are shared, and a run only counts as a view's own (`runMatches`) when its env matches the tab.
- **One command at a time, latest wins** (`startRun` in `host.ts`): while a run is going, the newest request waits, replacing any older waiting one. A request for the *same* command cancels the running one and discards its result, so a search box never waits behind a stale query. `finish()` starts the waiting request. The status line shows "Queued after …".
- **Output buffer**: the worker strips ANSI and handles `\r` redraws (`term.ts`). It keeps the last `MAX_LINES` (2000) lines and counts the dropped ones, and writes `output` to `storage.session` at most every 120 ms (only the popup's Output tab shows it). Raw stdout (up to 8 MB) is kept separately for the parser.
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
- `tabularis-query.mjs` runs `checkQuery()` (protocol.mjs): a single `SELECT`/`WITH`, or a write listed in `WRITES`, which maps a SQL file to the exact statement shape it must have (`sql/delete-syncs.sql`: `DELETE FROM sync_request WHERE status = 'FAIL' AND id IN ('<uuid>', …) RETURNING id`; `sql/add-project-user.sql`: `INSERT INTO refit_user_project_relation (user_id, project_id, role) VALUES ('<uuid>', '<uuid>', '<role>') ON CONFLICT (project_id, user_id) DO NOTHING RETURNING user_id, role`; `sql/create-project.sql`: the `CREATE_PROJECT` template, turned into a regex by `shape()` with each placeholder replaced by the only forms its binder emits (`SHAPES`)). The template lives in protocol.mjs, apart from the .sql file, so editing the file can't widen what's allowed; host.test.mjs checks the bound file still matches. A read must also contain no write keyword (`insert`, `update`, `delete`, `create`, …), because `WITH x AS (INSERT …) SELECT …` starts with `WITH`. Tabularis connects as `postgres` (superuser), so these fixed files plus Tabularis's own read-only mode and approval prompt are the guard.
- **Ask Hoàn before adding any command that writes, deletes or touches the network** (DB reads included), and before adding anything to `WRITES`.
- **Never run `tabularis-query.mjs` or any write command to test, not even with a fake binary.** Test guards as pure functions in `host/host.test.mjs`.

## Adding a command

1. Add an entry to `host/commands.json` (edits apply on the next run; no reinstall needed). For a query: a `sql/*.sql` file run by `tabularis-query.mjs`, with `"{env}"` as its connection arg and an `env` param (`prod|stag`, default `prod`); host.test.mjs checks every entry has both.
   - Tabularis has no bind parameters. SQL files use unquoted typed placeholders, filled by `bindParams()` (`PARAMS` in protocol.mjs): `:project_id` / `:user_id` (strict UUID), `:ids` (1-100 UUIDs), `:members` (0-50 `uuid:role`), `:offset` (int), `:status` / `:sync_status` / `:sort` / `:role` / `:project_status` / `:plan` (enums), `:end_date` (real `YYYY-MM-DD`), `:name` (hex text, not blank), `:q` (hex of UTF-8 text, emitted as `convert_from(decode('…','hex'),'UTF8')`). Every placeholder needs a value and every value must be used. `tabularis-query.mjs` takes them as `--name value` pairs after the row limit. Declare each param in commands.json with a matching `pattern` too, so the server rejects bad input before spawning.
   - A new kind of value gets a new validator in `PARAMS`. Never splice free text into SQL.
   - Match search text with `strpos(lower(col), lower(:q)) > 0` (no LIKE wildcards to escape).
   - **Tabularis read-only mode is ON** for refit-prod and blocks whatever it thinks is a write. It flags `replace(` in larger queries, so never use `replace()` or backslash string literals in SQL files. Leading `--` comments are fine (`stripLeadingComments()`).
   - Batch queries: `LIMIT 31 OFFSET :offset`. `sync_request` has no index on `connection_id`, so aggregate it in one pass (DISTINCT ON / GROUP BY) instead of a per-row subquery.
   - **Never test a query against prod without asking Hoàn.** Verify with captured samples in `src/samples/`, `pnpm test` and `ui-verify`.
2. Add its name to `Command` in `src/api.ts`.
3. Parse: write a pure parser with `parseTable()` (`src/table.ts`, which looks columns up by name, turns `""` into null for nullable columns, and checks numbers) plus a `*.test.ts` against captured output in `src/samples/`. Store the result in `storeResult()` in `src/host.ts` through its `save()` (which keys it by the run's env), under its own key, and add that key to `DATA_KEYS` in `src/table.ts` and the `Store` type in `shared/store.ts`. Send `env: ENV` with the run (browse views get it from `useBrowse`).
4. UI: add a view in `content/views.tsx` and a row on `Home`, add the view to `View` and `TITLES` in `content/App.tsx` (a browse view: `useBrowse` + `Browse` from `content/browse.tsx`), then add a fixture and nav mode to `.claude/skills/ui-verify/stub.js` and screenshot.

## Keyboard shortcuts

One mapping list, `KEYBINDS` in `src/keybinds.ts` (pure, tested by `keybinds.test.ts`), is the source for every surface:
- Each action is `{label, hint, default}`; today only `refetch` (default `r`). `settings.keys` stores only the user's overrides; `keysOf(settings.keys)` gives the full map (invalid overrides fall back to the default).
- `actionFor(event, keys)` maps a keypress to an action. It ignores Cmd / Ctrl / Alt (so Cmd+R stays the browser's reload) and anything typed into an input, textarea, select or contenteditable; Shift is fine. Keys are single letters or digits (`validKey`), so Esc / arrows / Enter stay fixed and are not in the list.
- `rebind(keys, action, key)` refuses a key another action already uses.
- Settings (drawer and popup) render `<KeybindList settings onChange />` from `shared/controls.tsx`: one row per action, click the key then press the new one (Esc cancels, Reset returns to the default). Its keydown is stopped so the drawer doesn't act on it.
- Drawer: `App`'s `onKeyDown` clicks the current view's `[data-refetch]` control (the StatusLine refresh icon, the Sync requests Fetch / Refetch button). A view with nothing to refetch (Home, Settings) has none, and neither does a view while its run is going (Cancel replaces Refresh). The footer shows `<kbd>` with the bound key on every view but Home and Settings.
- Popup: a `document` keydown listener (the popup opens with focus on `<body>`) runs the FAIL fetch, except on its Settings view or while a run is going.

**Adding a shortcut:** add an entry to `KEYBINDS`, handle the action where it applies (`actionFor(e, keys) === '<action>'`, or mark the target control with a `data-*` attribute the drawer clicks, like `data-refetch`), and add a case to `keybinds.test.ts`. Settings lists it automatically.

## Codebase structure

Read this first when a request comes in: find the feature in **Where to edit**, open those files, and grep the named symbol. Symbols are given instead of line numbers so they stay valid.

```
host/                     runs on your Mac (node), never in the browser
  server.mjs              `pnpm server`: unix socket, loadCommands() from commands.json, run() spawns (no shell), cancel(), live terminal
  host.mjs                native-messaging relay: Chrome stdio <-> unix socket, reports server up/down
  protocol.mjs            pure + tested: framing (encode/decoder), takeChunks, buildArgv; SQL binding: PARAMS, bindParams;
                          CONNECTIONS (env -> Tabularis id); write guard: WRITES, CREATE_PROJECT + SHAPES + shape(), checkQuery
  tabularis-query.mjs     one SQL file through `tabularis --mcp`: env -> connection, bindParams, checkQuery, 60s read / 5 min write
  commands.json           THE allowlist: command -> {exec, args with "{param}", params {pattern, default}, timeoutMs}
  sql/                    one file per command (reads: failed-syncs, projects, project-connections, connections, fitting-rooms,
                          project-members, user-search; writes: delete-syncs, add-project-user, create-project)
  host.test.mjs           pure checks (framing, argv, bindParams, checkQuery, commands.json shape) + relay/server end to end
  install.mjs             install-host / uninstall-host
public/manifest.json      MV3 manifest: content script on app.refit.ai + staging-app.refit.ai
src/
  api.ts                  Command union, Args, Req (run | cancel | hostStatus | openOptions | openTabs), call(), Run, HostState, MAX_TABS
  background.ts           worker entry: handle() routes Req, openTabs() (validated Refit URLs), paint() + countIcon() (count drawn as the toolbar icon)
  host.ts                 worker: connect() native port, startRun() (one at a time, latest wins, WRITES never queue),
                          onMessage(), finish() (run.tail, run.summary, run.result, follow-up `then`), storeResult() per command + env
  table.ts                parseTable() (Tabularis JSON reader), UUID, ENV / APP (prod vs staging), envKey(), DATA_KEYS
  projects.ts             types + parsers for browse and members (Project, ProjectConnection, ConnectionHit, FittingRoom, Member,
                          UserHit, Page...), BATCH, toHex/fromHex/cleanQuery/toArgs/queryOf, mergePage, dropStalePages,
                          cacheProject, pins (togglePin/refreshPins/pinnedFor), ROLES / PLANS / PROJECT_STATUSES, NO_PROJECT
  failed-syncs.ts         FailedSync (+ recovered*), parseFailedSyncs, SYNC_STATUSES / SyncStatus / SyncRequests, liveFails,
                          URL builders connectionUrl / projectUrl / fittingRoomUrl, platform, dateRange
  term.ts                 ANSI strip, line split/cap, ago(), runStatus() (pill text + tone)
  keybinds.ts             KEYBINDS (the shortcut mapping list), keysOf, actionFor, rebind, validKey, keyLabel, isTyping
  themes.ts ui.css        THEMES, Settings (theme, mode, badge, drawerWidth, keys), DEFAULTS, vars(); shared CSS primitives + sync cards
  shared/
    store.ts              useStore() (reads this tab's env keys + live updates), saveSettings, useDark, useNow, isRunning
    SyncList.tsx          sync cards (drawer + popup): Succeeded after chip, status-aware foot/reason, select mode, Open in Refit
    icons.tsx             ICONS (Lucide paths; add new icons here), Icon, IconBtn
    controls.tsx          Segmented, Switch, ThemePicker, KeybindList
    HostSetup.tsx         host missing / offline screens, hostLabel / hostTone, HostCard
    Terminal.tsx          raw output (popup's Output tab only)
  content/                the drawer (content script, closed shadow DOM)
    main.tsx              mounts App in a shadow root, injects fonts, stops key events reaching the page
    App.tsx               View union + TITLES, view stack (push / back), header buttons, per-view query state, exec(), pin(),
                          toasts, ViewBoundary (crash banner), resize wiring, routes `view.kind` -> component
    views.tsx             Home (CommandRow list + pinned), ProjectsView (ProjectRow), ProjectView (Connections | Members switch,
                          ProjectConnectionsPanel), ConnectionList (cards + select + Open in Refit), ConnectionsView, FittingRoomsView;
                          `Common` props type every view gets
    failed.tsx            FailedView (status tabs, fetch, Select mode, bulk bar) + Confirm (delete confirm)
    members.tsx           MembersPanel (member list), AddUser, UserPicker (shared user search)
    new-project.tsx       NewProjectView (create-project form + confirm)
    browse.tsx            shared list plumbing: useBrowse (debounced fetch, refresh, loadMore), runMatches, StatusLine, ErrorBanner,
                          Empty, Skeleton, SearchBox, LoadMore (auto), Browse wrapper, useDebounced
    resize.ts             useResize (left-edge drag, arrows, double-click reset; MIN/MAX/DEFAULT_WIDTH)
    Settings.tsx          SettingsView (drawer settings page)
    styles.css            drawer styles, one `/* … */` section per feature (see Where to edit)
  popup/                  toolbar popup: main.tsx (Popup), PopupSettings.tsx, popup.css
  options.tsx             extension settings page (host setup)
  *.test.ts               pure tests run by `pnpm test` (term, failed-syncs, projects, keybinds) against src/samples/
.claude/skills/           ui-system (design rules), ui-verify (stub.js + mock.html + shoot.sh screenshots)
```

### Where to edit

| Request is about… | Edit | Symbols / CSS section |
|---|---|---|
| Home screen rows, pinned list | `content/views.tsx` | `Home`, `CommandRow`; CSS "Home: command list" |
| A new drawer screen | `content/App.tsx` + a component | add to `View` and `TITLES`, route it where `body =` is set, `push({kind})` from a button |
| Header buttons (back, +, settings, close), STAG chip | `content/App.tsx` | the `<header className="head">` block; CSS "Drawer", "Staging" |
| Drawer open/close, Esc, toasts, crash banner | `content/App.tsx` | `App` (onKeyDown, `flash`), `ViewBoundary` |
| Drawer width / resize handle | `content/resize.ts`, `App.tsx` | `useResize`, `clampWidth`; CSS "Left-edge resize handle" |
| Projects list: search, filters, sort, pin | `content/views.tsx`, `projects.ts`, `host/sql/projects.sql` | `ProjectsView`, `ProjectRow`, `STATUSES`, `PROJECT_SORTS`; pins: `togglePin` / `pinnedFor`; CSS "Projects list" |
| One project: header, tabs | `content/views.tsx` | `ProjectView`, `PROJECT_TABS`; CSS "One project" |
| Project connections list, sort, group by service | `content/views.tsx`, `host/sql/project-connections.sql` | `ProjectConnectionsPanel`, `CONN_SORTS`, `ConnectionList` (`groupBy`) |
| Connection cards anywhere (incl. select + Open in Refit, live FAIL count / reason) | `content/views.tsx`, `failed-syncs.ts`, `background.ts` | `ConnectionList`, `liveFails`, `openTabs`, `MAX_TABS`; CSS "Select toggle…", "Bulk bar" |
| Connections search (all projects) | `content/views.tsx`, `host/sql/connections.sql` | `ConnectionsView`, `parseConnections` |
| Fitting rooms search | `content/views.tsx`, `host/sql/fitting-rooms.sql` | `FittingRoomsView`, `parseFittingRooms`, `fittingRoomUrl` |
| Members list, Add user | `content/members.tsx`, `host/sql/project-members.sql`, `user-search.sql`, `add-project-user.sql` | `MembersPanel`, `AddUser`, `UserPicker`; CSS "Project members + Add user" |
| New project form | `content/new-project.tsx`, `host/sql/create-project.sql`, `host/protocol.mjs` | `NewProjectView`, `DEFAULT_MEMBER`; `CREATE_PROJECT`, `SHAPES`; CSS "New project form" |
| Sync requests (status tabs), select, delete confirm | `content/failed.tsx`, `shared/SyncList.tsx`, `host/sql/failed-syncs.sql`, `delete-syncs.sql` | `FailedView`, `SYNC_STATUSES`, `Confirm`, `MAX_DELETE`, `SyncList`; CSS "Failed syncs…", "Bulk bar" |
| Search box, status line, error banner, empty / loading, load more | `content/browse.tsx` | `SearchBox`, `StatusLine` (`tools` slot, `data-refetch`), `ErrorBanner`, `Empty`, `Skeleton`, `LoadMore`, `useBrowse` (`MAX_AGE` revalidate); CSS "Search", "Run bar", "Browse results", "Loading skeleton" |
| Batch size, paging, query <-> args | `projects.ts` (+ every browse SQL's `LIMIT 31`) | `BATCH`, `toArgs`, `queryOf`, `mergePage` |
| Prod vs staging behaviour | `table.ts`, `host/protocol.mjs` | `ENV`, `APP`, `envKey`, `DATA_KEYS`; `CONNECTIONS` |
| Links into Refit | `failed-syncs.ts` | `connectionUrl`, `projectUrl`, `fittingRoomUrl` (UUID-checked) |
| What a run result writes / its toast text | `host.ts` | `storeResult` (one branch per command), `finish`, `outcome`, `run.summary` / `run.tail` |
| Run queueing, cancel, superseding | `host.ts` | `startRun`, `WRITES`, `cancelRun`, `pending` |
| Which SQL is allowed, param validation | `host/protocol.mjs`, `host/commands.json` | `PARAMS`, `bindParams`, `WRITES`, `checkQuery`; the command's `params` patterns |
| Running SQL through Tabularis (timeouts, errors) | `host/tabularis-query.mjs` | `fail`, `TIMEOUT_MS`, `onReply` |
| Keyboard shortcuts (add, rebind UI, handling) | `keybinds.ts`, `shared/controls.tsx`, `content/App.tsx`, `popup/main.tsx` | `KEYBINDS`, `actionFor`, `rebind`, `KeybindList`, `data-refetch`; CSS `.keybinds`, `.key-capture` (ui.css) |
| Theme, colours, mode, drawer settings page | `themes.ts`, `ui.css`, `shared/controls.tsx`, `content/Settings.tsx` | `THEMES`, `Settings`, `DEFAULTS`, `ThemePicker`, `SettingsView` |
| Icons | `shared/icons.tsx` | `ICONS` (add a path), `Icon`, `IconBtn` |
| Toolbar popup, toolbar icon count | `popup/main.tsx`, `popup/popup.css`, `background.ts` | `Popup`, `SHOWN`; icon: `paint`, `countIcon` |
| Host setup / offline screens | `shared/HostSetup.tsx`, `options.tsx` | `HostSetup`, `HostCard`, `hostProblem` |
| Screenshots of a new state | `.claude/skills/ui-verify/stub.js`, `mock.html`, `shoot.sh` | fixtures in stub.js, nav in mock.html (`&tab=IN_PROGRESS` picks a Sync requests tab, `&reloading` = the Connections search refetching over its page), `MODES` in shoot.sh; the stub records requests on `<html data-sent>` for `--dump-dom` checks |

### How a command flows (touch these in order for a new one)

1. `host/sql/<name>.sql` (placeholders like `:project_id`) → 2. `host/commands.json` entry (`"{env}"` connection arg, params with patterns) → 3. new value types in `PARAMS`; a write also in `WRITES` (`protocol.mjs`), **ask Hoàn first** → 4. `Command` in `src/api.ts` → 5. parser + types in `src/projects.ts` (or `failed-syncs.ts`) → 6. a `storeResult` branch in `src/host.ts` (writes go through `save()`), the key in `DATA_KEYS` (`table.ts`) and `Store` (`shared/store.ts`) → 7. UI: call `exec(command, { env: ENV, ... })` (browse views via `useBrowse`) and render from `useStore()` data passed down from `App.tsx`.

- Two Vite builds: `vite.config.ts` (options, popup, worker as ES modules) and `vite.content.config.ts` (content script as one IIFE, fonts inlined).
- Connection link: `https://app.refit.ai/{project_id}/datasources/{service|file}/{connection_id}` (refit-app-2 route `/_auth/$projectId/datasources/service/$datasourceId`, where datasourceId = `connection.id`).
- Popup must stay ≤ 600px tall: `H=600 bash .claude/skills/ui-verify/shoot.sh popup many`.

## UI system

Same as claude-sidecar. Full guide in the `ui-system` skill. Tokens come from `themes.ts` on `.root`, shared primitives and components live in `ui.css`, and the fonts are Geist + JetBrains Mono. Motion is ease-out, ≤ 300ms, exact transition properties, and every stylesheet has a reduced-motion block.

## Conventions

- Keep it small: no new dependencies for what a few lines do. Mark deliberate shortcuts with `// ponytail:` and name the ceiling.
- Pure logic goes in a chrome-free module with an assert test next to it (`*.test.ts`, run by `pnpm test`).
- Effects use block bodies: `useEffect(() => { x() }, [])`.
- Commits: conventional title (`feat(host): ...`) + bullet body, no emojis, no AI attribution. Commit directly on `main` (no feature branches); never push, Hoàn does that.
- Shell hooks:
  - A PreToolUse hook treats the first line of any heredoc (or the text after `-m`) as a commit message. Write files with the editor.
  - Another hook blocks commands that mention `dist`, `build` or `node_modules` as path words unless the command starts with `npm run build`. Use `npm run build --prefix <repo>`.
- Use AGENTS.md for agent docs, not CLAUDE.md.

## Skills (load when relevant)

- `.claude/skills/ui-system`: building or restyling any UI surface
- `.claude/skills/ui-verify`: screenshot the drawer or popup without loading the extension
