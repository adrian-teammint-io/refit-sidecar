---
name: architecture
description: Refit Sidecar's runtime design: worker-owned native port, relay + unix socket, framing protocol, chunking, per-env result storage, one-run-at-a-time queue, output buffer and host lifecycle. Use when debugging host connection, offline/missing states, queueing, superseded runs, storage keys, staging vs prod results, or changing host.mjs / server.mjs / src/host.ts.
---

# Architecture

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
- **Results** (`storage.local`): `failedSyncs` (the FAIL fetch), `syncRequests` (`{IN_PROGRESS, FRAGMENTED}`, same shape), plus pages `{at, runId, query, rows, hasMore}` for `projects`, `connections` and `fittingRooms`, and for `projectConnections` (by project id) and `fittingRoomConnections` (by fitting room id), newest `MAX_CACHED_PROJECTS` kept each. `fittingRoomFlows` holds one `{at, runId, rows, truncated}` per fitting room (not a page: the flow is one fetch), same cap. `mergePage()` appends a run of the same query at the next offset; any other query replaces the page. `pins` holds a project snapshot per pinned id, refreshed whenever that project comes back in a result. A failed run keeps the last good rows and adds `error`. Results are per environment: prod uses these key names (the popup and toolbar icon only read prod), staging stores `stag.<key>` (`envKey()`, `DATA_KEYS` in `src/table.ts`). The worker writes under the run's `args.env`; `useStore` reads the tab's `ENV`. `settings`, `run`, `host` and `output` are shared, and a run only counts as a view's own (`runMatches`, through `commandState` in `browse.tsx`) when its env matches the tab.
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
