# Refit Sidecar

> **Asked to change something?** 1) Match the request to a skill in [Skill routing](#skill-routing) and load it. 2) Find the feature in [Where to edit](#where-to-edit): it names the files, symbols and CSS section, so you can open the right file without searching.

Chrome MV3 extension for app.refit.ai and staging-app.refit.ai that runs allowlisted commands in a terminal you keep open (`pnpm server`) and shows their output on the page. Every command takes `env` (`prod` | `stag`, default `prod`), which `tabularis-query.mjs` maps to a Tabularis connection (`CONNECTIONS` in protocol.mjs: REFIT_ PROD / REFIT_STAG). All commands are SELECTs except the three writes, `delete-syncs`, `add-project-user` and `create-project`. The full command catalog is in the `add-command` skill.

All writes are blocked by Tabularis read-only mode until Hoàn approves them in the Tabularis app, so they wait up to 5 min. None queues: the worker refuses a write while another command runs (`WRITES` in `src/host.ts`). Queries never select `refit_user.pwd` or tokens.

Surfaces: the **drawer** (a stack of views injected into app.refit.ai / staging-app.refit.ai, closed shadow DOM), the **toolbar icon + popup** (FAIL count and last run) and the **settings page** (native host setup). How each behaves is in the `drawer-views` skill.

## Skill routing

Load the skill whose keywords match the request (several can apply). Skills live in `.claude/skills/<name>/SKILL.md`.

| Skill | Load when the request mentions… |
|---|---|
| `add-command` | new command, query, SQL, `host/sql`, `commands.json`, params, `PARAMS`, `bindParams`, `WRITES`, `checkQuery`, Tabularis, parser, `parseTable`, sample, `readResult` / `writeResult`, delete / add user / create project write, command list, what a command returns |
| `drawer-views` | drawer, view, screen, Home, Projects, Project, Members, Add user, New project, Duplicate, Connections, Fitting room, Flow, Steps, Graph, Sync requests, FAIL / IN_PROGRESS / FRAGMENTED, select mode, bulk bar, pins, breadcrumbs, resize, toast, popup, toolbar icon, staging chip, keyboard shortcut, keybind, refetch key, adding a view |
| `architecture` | native host, relay, unix socket, `pnpm server`, protocol, framing, chunk, offline / missing / forbidden / down, reconnect, queue, superseded, latest wins, cancel, storage keys, `DATA_KEYS`, `envKey`, prod vs stag results, output buffer, lifecycle, worker restart |
| `ui-system` | style, CSS, theme, colour, dark / light, font, typography, motion, animation, spacing, layout, new component, restyle, UI review |
| `ui-verify` | screenshot, visual check, verify UI, render bug, stub, mock, fixture, popup height |

## Commands (pnpm)

| Command | What it does |
|---|---|
| `pnpm dev` | Watch-build into `dist/` (load `dist/` unpacked, hit reload in `chrome://extensions`) |
| `pnpm build` | Typecheck + production build |
| `pnpm server` | **The terminal server.** Keep it open: it runs the commands, prints every run live, and streams output back to the page |
| `pnpm test` | `node --test` over every `src/*.test.ts` and `host/*.test.mjs` (assert scripts; host.test drives the real relay + server). A new test file is picked up by itself |
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

The worker owns the only native port; surfaces send `call(req)` and render from storage. Details (protocol, chunking, storage keys, run queue, lifecycle) are in the `architecture` skill.

- Two Vite builds: `vite.config.ts` (options, popup, worker as ES modules) and `vite.content.config.ts` (content script as one IIFE, fonts inlined).

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
  sql/                    one file per command (reads: failed-syncs, projects, project-connections, connections, fitting-rooms, fitting-room-connections, fitting-room-flow,
                          project-members, user-search; writes: delete-syncs, add-project-user, create-project)
  host.test.mjs           pure checks (framing, argv, bindParams, checkQuery, commands.json shape) + relay/server end to end
  install.mjs             install-host / uninstall-host
public/manifest.json      MV3 manifest: content script on app.refit.ai + staging-app.refit.ai
src/
  api.ts                  Command union, Args, Req (run | cancel | hostStatus | openOptions | openTabs | fonts), call(), Run, HostState, MAX_TABS
  background.ts           worker entry: handle() routes Req, openTabs() (validated Refit URLs), paint() + countIcon() (count drawn as the toolbar icon)
  host.ts                 worker: connect() native port, startRun() (one at a time, latest wins, WRITES never queue),
                          onMessage(), finish() (run.tail, run.summary, run.result, follow-up `then`), storeResult() -> writeResult()
                          (writes: summary + follow-up, writeRows) or readResult() (reads: rows per command + env, outcome)
  table.ts                parseTable() (Tabularis JSON reader), UUID, ENV / APP (prod vs staging), envKey(), DATA_KEYS
  projects.ts             types + parsers for browse and members (Project, ProjectConnection, ConnectionHit, FittingRoom, Member,
                          UserHit, Page...), BATCH, toHex/fromHex/cleanQuery/toArgs/queryOf, mergePage, dropStalePages,
                          cacheProject, pins (togglePin/refreshPins/pinnedFor), ROLES / PLANS / PROJECT_STATUSES, NO_PROJECT
  failed-syncs.ts         FailedSync (+ recovered*), parseFailedSyncs, SYNC_STATUSES / SyncStatus / SyncRequests, liveFails, platform, dateRange
  links.ts                every link into Refit: connectionUrl / projectUrl / fittingRoomUrl / fittingNodeUrl (UUID-checked, per APP)
  flow.ts                 fitting room graph: FlowNode / Flow / FittingRoomFlows, parseFlow, matchesNode (Flow search),
                          steps (layer per node, cycle-safe), layers (ordered per step), layout + BOX (Graph geometry)
  term.ts                 ANSI strip, line split/cap, ago(), plural() ("3 members"), runOk() (clean finish), runStatus() (pill text + tone)
  keybinds.ts             KEYBINDS (the shortcut mapping list), keysOf, actionFor, rebind, validKey, keyLabel, isTyping
  themes.ts ui.css        THEMES, Settings (theme, mode, badge, drawerWidth, keys, font, monoFont), DEFAULTS, fontFamily(), vars()
                          (colors + --sans / --mono when a custom font is set); shared CSS primitives + sync cards
  shared/
    store.ts              Data (stored result shapes, also typed by the worker), Store, useStore() (this tab's env keys + live updates),
                          saveSettings, useDark, useNow, isRunning
    SyncList.tsx          sync cards (drawer + popup): Succeeded after chip, status-aware foot/reason, select mode, Open in Refit
    card.tsx              CardHead (check, badge, title, chips, open link), pickOnClick, stagger, UserLabel (avatar + email + name),
                          ProjectLink (card's project name), OpenInRefit (header button)
    icons.tsx             ICONS (Lucide paths; add new icons here), Icon, IconBtn
    controls.tsx          Segmented, Switch, ThemePicker, FontPicker, KeybindList
    HostSetup.tsx         host missing / offline screens, hostLabel / hostTone, HostCard
    Terminal.tsx          raw output (popup's Output tab only)
  content/                the drawer (content script, closed shadow DOM)
    main.tsx              mounts App in a shadow root, injects fonts, stops key events reaching the page
    App.tsx               view stack (push / back / replace), header (Back, breadcrumbs, registry button, settings, close),
                          per-view query state (useQuery), exec(), pin(), toasts, ViewBoundary (crash banner), resize wiring
    routes.tsx            View union, Ctx (what a view gets), VIEWS registry (title, render, header button, noHost), titleOf
    home.tsx              Home (CommandRow list + pinned)
    projects.tsx          ProjectsView (ProjectRow), ProjectView (Connections | Members switch), ConnectionsPanel (searchable
                          connection list for one id-scoped command: project-connections or fitting-room-connections)
    connections.tsx       ConnectionList (cards + select + Open in Refit), SelectToggle, ConnectionsView
    fitting.tsx           FittingRoomsView (clickable cards), FittingRoomView (header, Flow | Connections switch)
    flow.tsx              FlowPanel (status, search, Steps | Graph), FlowSkeleton, Steps, Graph + usePan (drag to pan), OpenNode
    failed.tsx            FailedView (status tabs, fetch, Select mode, bulk bar) + Confirm (delete confirm)
    members.tsx           MembersPanel (member list), AddUser, UserPicker (shared user search)
    new-project.tsx       NewProjectView (create-project form + confirm)
    browse.tsx            shared list plumbing: Common / Exec / OpenFailed types, commandState (a command's mine / busy / last / ok), pageCount,
                          useBrowse (debounced fetch, refresh, loadMore), RunBar (status row) + StatusLine (RunBar for a browse
                          command; Sync requests uses RunBar directly), ErrorBanner, Empty, Skeleton, SearchBox,
                          LoadMore (auto), Browse wrapper, useDebounced
    ui.tsx                shared view pieces: useSelection + SelectionRow (select mode bulk bar), EnvTag, WriteConfirm (every write's confirm)
    resize.ts             useResize (left-edge drag, arrows, double-click reset; MIN/MAX/DEFAULT_WIDTH)
    Settings.tsx          SettingsView (drawer settings page)
    styles.css            drawer styles, one `/* … */` section per feature (see Where to edit)
  popup/                  toolbar popup: main.tsx (Popup), PopupSettings.tsx, popup.css
  options.tsx             extension settings page (host setup)
  *.test.ts               pure tests run by `pnpm test` (term, failed-syncs, projects, flow, keybinds, themes) against src/samples/
.claude/skills/           add-command, drawer-views, architecture, ui-system, ui-verify (see Skill routing)
```

### Where to edit

| Request is about… | Edit | Symbols / CSS section |
|---|---|---|
| Home screen rows, pinned list | `content/home.tsx` | `Home`, `CommandRow`; CSS "Home: command list" |
| A new drawer screen | `content/routes.tsx` + a component | `drawer-views` skill → Adding a view |
| Header buttons (back, breadcrumbs, +, settings, close), STAG chip | `content/App.tsx`, `content/routes.tsx` | the `<header className="head">` block, a view's `header` in `VIEWS`; CSS "Drawer", "Breadcrumbs", "Staging" |
| Drawer open/close, Esc, toasts, crash banner | `content/App.tsx` | `App` (onKeyDown, `flash`), `ViewBoundary` |
| Drawer width / resize handle | `content/resize.ts`, `App.tsx` | `useResize`, `clampWidth`; CSS "Left-edge resize handle" |
| Projects list: search, filters, sort, pin | `content/projects.tsx`, `projects.ts`, `host/sql/projects.sql` | `ProjectsView`, `ProjectRow`, `STATUSES`, `PROJECT_SORTS`; pins: `togglePin` / `pinnedFor`; CSS "Projects list" |
| One project: header, tabs | `content/projects.tsx` | `ProjectView`, `PROJECT_TABS`; CSS "One project" |
| Project connections list, sort, group by service | `content/projects.tsx`, `content/connections.tsx`, `host/sql/project-connections.sql` | `ConnectionsPanel`, `CONN_SORTS`, `ConnectionList` (`groupBy`) |
| Connection cards anywhere (incl. select + Open in Refit, live FAIL count / reason) | `content/connections.tsx`, `failed-syncs.ts`, `background.ts` | `ConnectionList`, `liveFails`, `openTabs`, `MAX_TABS`; CSS "Select toggle…", "Bulk bar" |
| Connections search (all projects) | `content/connections.tsx`, `host/sql/connections.sql` | `ConnectionsView`, `parseConnections` |
| Fitting rooms search | `content/fitting.tsx`, `host/sql/fitting-rooms.sql` | `FittingRoomsView` (`openRoom`, CSS `.open-card`), `parseFittingRooms`, `fittingRoomUrl` |
| A fitting room's connections | `content/fitting.tsx`, `content/projects.tsx`, `host/sql/fitting-room-connections.sql` | `FittingRoomView`, `ConnectionsPanel`, `project-connections` / `fitting-room-connections` branch in `readResult` |
| A fitting room's flow (Steps / Graph) | `content/flow.tsx`, `src/flow.ts`, `host/sql/fitting-room-flow.sql`, `content/styles.css` (Fitting room Flow tab) | `FlowPanel`, `FlowSkeleton`, `Steps`, `Graph`, `usePan`, `OpenNode`; `steps` / `layers` / `layout`, `matchesNode`, `parseFlow`; `fitting-room-flow` branch in `readResult` |
| Members list, Add user | `content/members.tsx`, `host/sql/project-members.sql`, `user-search.sql`, `add-project-user.sql` | `MembersPanel`, `AddUser`, `UserPicker`; CSS "Project members + Add user" |
| New project form, Duplicate | `content/new-project.tsx`, `content/projects.tsx` (`ProjectRow` button), `host/sql/create-project.sql`, `host/protocol.mjs` | `NewProjectView`, `DEFAULT_MEMBER`; `CREATE_PROJECT`, `SHAPES`; CSS "New project form" |
| Sync requests (status tabs), select, delete confirm | `content/failed.tsx`, `shared/SyncList.tsx`, `host/sql/failed-syncs.sql`, `delete-syncs.sql` | `FailedView`, `SYNC_STATUSES`, `Confirm`, `MAX_DELETE`, `SyncList`; CSS "Failed syncs…", "Bulk bar" |
| Search box, status line, error banner, empty / loading, load more | `content/browse.tsx` | `SearchBox`, `StatusLine` (`tools` slot, `data-refetch`), `ErrorBanner`, `Empty`, `Skeleton`, `LoadMore`, `useBrowse` (`MAX_AGE` revalidate); CSS "Search", "Run bar", "Browse results", "Loading skeleton" |
| Batch size, paging, query <-> args | `projects.ts` (+ every browse SQL's `LIMIT 31`) | `BATCH`, `toArgs`, `queryOf`, `mergePage` |
| Prod vs staging behaviour | `table.ts`, `host/protocol.mjs` | `ENV`, `APP`, `envKey`, `DATA_KEYS`; `CONNECTIONS` |
| Links into Refit | `links.ts` | `connectionUrl`, `projectUrl`, `fittingRoomUrl`, `fittingNodeUrl` (UUID-checked) |
| What a run result writes / its toast text | `host.ts` | `readResult` (reads: one branch per command), `writeResult` (writes: `summary`, follow-up `then`), `finish`, `outcome`, `run.summary` / `run.tail` |
| Run queueing, cancel, superseding | `host.ts` | `startRun`, `WRITES`, `cancelRun`, `pending` |
| Which SQL is allowed, param validation | `host/protocol.mjs`, `host/commands.json` | `PARAMS`, `bindParams`, `WRITES`, `checkQuery`; the command's `params` patterns |
| Running SQL through Tabularis (timeouts, errors) | `host/tabularis-query.mjs` | `fail`, `TIMEOUT_MS`, `onReply` |
| Keyboard shortcuts (add, rebind UI, handling) | `keybinds.ts`, `shared/controls.tsx`, `content/App.tsx`, `popup/main.tsx` | `KEYBINDS`, `actionFor`, `rebind`, `KeybindList`, `data-refetch`; CSS `.keybinds`, `.key-capture` (ui.css) |
| Theme, colours, mode, fonts, drawer settings page | `themes.ts`, `ui.css`, `shared/controls.tsx`, `content/Settings.tsx` | `THEMES`, `Settings`, `DEFAULTS`, `ThemePicker`, `FontPicker` (installed fonts from the worker's `fonts` Req, `chrome.fontSettings`; `FONTS` fallback suggestions), `fontFamily`, `SettingsView` |
| Icons | `shared/icons.tsx` | `ICONS` (add a path), `Icon`, `IconBtn` |
| Toolbar popup, toolbar icon count | `popup/main.tsx`, `popup/popup.css`, `background.ts` | `Popup`, `SHOWN`; icon: `paint`, `countIcon` |
| Host setup / offline screens | `shared/HostSetup.tsx`, `options.tsx` | `HostSetup`, `HostCard`, `hostProblem` |
| Screenshots of a new state | `.claude/skills/ui-verify/stub.js`, `mock.html`, `shoot.sh` | fixtures in stub.js, nav in mock.html (`&tab=IN_PROGRESS` picks a Sync requests tab, `&reloading` = the Connections search refetching over its page, `click=` also hits focusable cards by aria-label, `&find=` types into the newest search box after the clicks, `&noflow` drops the cached flow for its skeleton), `MODES` in shoot.sh; the stub records requests on `<html data-sent>` for `--dump-dom` checks |
| Card header, user rows, project link, Open in Refit, select mode, write confirms | `shared/card.tsx`, `content/ui.tsx` | `CardHead`, `UserLabel`, `ProjectLink`, `OpenInRefit`, `useSelection`, `SelectionRow`, `WriteConfirm`, `EnvTag`; CSS "Bulk bar", "Project members + Add user" |

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

## Code principles

What the codebase already follows; keep new code in line:
- **One home per rule (DRY).** Refit links: `src/links.ts`. "Run finished clean": `runOk` (`term.ts`). A command's run state: `commandState` (`browse.tsx`). Status line counts: `pageCount`. Card project name / header Open in Refit: `ProjectLink` / `OpenInRefit` (`shared/card.tsx`). Stored result shapes: `Data` (`shared/store.ts`), shared by the worker and the surfaces. Grep for an existing helper before writing a second copy.
- **Single responsibility per module.** Parsers are pure and chrome-free (`projects.ts`, `failed-syncs.ts`, `flow.ts`, `table.ts`); the worker routes a finished run to `writeResult` (summaries and follow-ups) or `readResult` (store rows); views render from `useStore()` and only call `exec`.
- **Open for extension through tables.** A view is a `VIEWS` entry, a shortcut a `KEYBINDS` entry, a command a `commands.json` entry plus one result branch, a test a `*.test.ts` file. Adding one doesn't mean editing a switch somewhere else.
- **Validate at every trust boundary.** Server: `commands.json` patterns, then `PARAMS` / `checkQuery` in `tabularis-query.mjs`. Worker: `openTabs` URL shape. Links: UUID-shaped ids only (`links.ts`). Never drop one of these as "duplicate"; the layers are deliberate (see Security rules).
- **No speculative abstraction.** No interface with one implementation, no config for a value that never changes. Three similar lines beat a premature helper; extract on the third copy.
