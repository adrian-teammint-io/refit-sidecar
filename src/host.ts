// Worker side of the native host: owns the one connectNative port (to the relay, host/host.mjs, which forwards to
// `pnpm server` in a terminal), runs commands, buffers their output. Surfaces never see the port.
// They read `host` / `output` (storage.session) and `run` plus each command's result key (storage.local).
import type { Args, Command, HostState, Output, Run } from './api'
import { flushCarry, pushLines, splitChunk, type Line } from './term'
import { parseFailedSyncs, type FailedSyncs } from './failed-syncs'
import {
  parseProjects, parseProjectConnections, parseConnections, parseFittingRooms, mergePage, cacheProject, queryOf, refreshPins, dropStalePages,
  type Projects, type ProjectConnections, type Connections, type FittingRooms, type Pins, type ProjectsQuery, type ConnectionsQuery, type TextQuery,
} from './projects'

export const HOST = 'com.hoan.refit_sidecar' // keep in sync with NAME in host/install.mjs
const FLUSH_MS = 120 // throttle for storage writes while output streams
const MAX_STDOUT = 8 * 1024 * 1024 // ponytail: raw stdout kept for the parser; a bigger result fails to parse
const RETRY_MAX_MS = 60_000

type HostMsg =
  | { id: 'status'; server: 'up' | 'down' } // from the relay, whenever the terminal server comes or goes
  | { id: string; hello: { commands: string[] } }
  | { id: string; stream: 'stdout' | 'stderr'; chunk: string }
  | { id: string; exit: number; signal?: string; ms: number }
  | { id: string; error: string }

type Current = { run: Run; out: Output; carry: { out: string; err: string }; stdout: string; superseded?: boolean }

let port: chrome.runtime.Port | undefined
let current: Current | undefined
let flushTimer: ReturnType<typeof setTimeout> | undefined
let retryMs = 1000
let retryTimer: ReturnType<typeof setTimeout> | undefined
// ponytail: one queued run, latest wins; enough for search-as-you-type and auto-loads, a real queue if commands pile up
let pending: { command: Command; args: Args } | undefined

const setHost = (host: HostState) => chrome.storage.session.set({ host })

export function connect() {
  if (port) return port
  clearTimeout(retryTimer)
  setHost({ state: 'connecting' })
  const p = chrome.runtime.connectNative(HOST)
  port = p
  p.onMessage.addListener(onMessage)
  p.onDisconnect.addListener(() => {
    const error = chrome.runtime.lastError?.message ?? 'Native host has exited.'
    if (port === p) port = undefined
    if (current) finish({ error: `Host stopped: ${error}` })
    if (/not found/i.test(error)) return setHost({ state: 'missing', error })
    if (/forbidden/i.test(error)) return setHost({ state: 'forbidden', error })
    // Crashed or exited: try again with backoff. If the worker sleeps first, the next surface to open reconnects.
    const retryAt = Date.now() + retryMs
    retryTimer = setTimeout(connect, retryMs)
    retryMs = Math.min(retryMs * 2, RETRY_MAX_MS)
    setHost({ state: 'down', error, retryAt })
  })
  return p // the relay reports server status on its own; hello follows once the server is up
}

// One command runs at a time. While one runs, the newest request waits (replacing any older waiting one), and a
// request for the same command supersedes the running one: it is cancelled and its result thrown away, so typing
// in a search box never waits behind a stale query.
export function startRun(command: Command, args: Args = {}): string {
  if (current) {
    pending = { command, args }
    if (current.run.command === command && !current.superseded) {
      current.superseded = true
      port?.postMessage({ id: current.run.id, type: 'cancel' })
    }
    return 'queued'
  }
  const p = connect()
  const id = crypto.randomUUID()
  current = {
    run: { id, command, args, startedAt: Date.now() },
    out: { runId: id, lines: [{ s: 'sys', t: `$ ${[command, ...Object.values(args)].join(' ')}` }], dropped: 0 },
    carry: { out: '', err: '' },
    stdout: '',
  }
  chrome.storage.local.set({ run: current.run })
  chrome.storage.session.set({ output: current.out })
  p.postMessage({ id, type: 'run', command, args })
  return id
}

export function cancelRun() {
  if (!current) throw new Error('Nothing is running')
  port?.postMessage({ id: current.run.id, type: 'cancel' })
  append([{ s: 'sys', t: '^C cancelling…' }])
}

function onMessage(m: HostMsg) {
  if ('server' in m) {
    retryMs = 1000 // the relay is alive
    if (m.server === 'up') port?.postMessage({ id: 'hello', type: 'hello' })
    else {
      if (current) finish({ error: 'Server stopped. Start it again with `pnpm server`.' })
      setHost({ state: 'offline' })
    }
    return
  }
  if (m.id === 'hello') {
    if ('hello' in m) setHost({ state: 'ready', commands: m.hello.commands })
    else if ('error' in m) setHost({ state: 'down', error: m.error })
    return
  }
  if (!current || m.id !== current.run.id) return // a late message from a run we already closed
  if ('stream' in m) {
    const s = m.stream === 'stderr' ? 'err' : 'out'
    if (s === 'out' && current.stdout.length < MAX_STDOUT) current.stdout += m.chunk
    const r = splitChunk(current.carry[s], m.chunk)
    current.carry[s] = r.carry
    append(r.lines.map(t => ({ s, t })))
  } else if ('exit' in m) finish({ exit: m.exit, signal: m.signal })
  else if ('error' in m) finish({ error: m.error })
}

function append(lines: Line[]) {
  if (!current || !lines.length) return
  current.out.dropped += pushLines(current.out.lines, lines)
  flushTimer ??= setTimeout(flush, FLUSH_MS)
}

function flush() {
  clearTimeout(flushTimer)
  flushTimer = undefined
  if (current) chrome.storage.session.set({ output: current.out })
}

async function finish(end: Pick<Run, 'exit' | 'signal' | 'error'>) {
  const c = current
  if (!c) return
  current = undefined
  for (const s of ['out', 'err'] as const) c.out.dropped += pushLines(c.out.lines, flushCarry(c.carry[s]).map(t => ({ s, t })))
  if (end.error) c.out.lines.push({ s: 'sys', t: end.error })
  if (c.superseded) c.out.lines.push({ s: 'sys', t: 'superseded by a newer request' })
  const run: Run = { ...c.run, ...end, endedAt: Date.now() }
  clearTimeout(flushTimer)
  flushTimer = undefined
  await chrome.storage.session.set({ output: c.out })
  if (!c.superseded) await storeResult(run, c.stdout)
  await chrome.storage.local.set({ run })
  const next = pending
  pending = undefined
  if (next) { try { startRun(next.command, next.args) } catch {} }
}

// Fresh rows on success; otherwise the last good rows stay on screen, flagged with what went wrong.
function outcome<T extends { error?: string }>(prev: T | undefined, empty: T, run: Run, parse: () => T): T {
  if (run.exit === 0 && !run.error) {
    try { return parse() } catch (e) { return { ...(prev ?? empty), error: `Could not read output: ${(e as Error).message}` } }
  }
  return { ...(prev ?? empty), error: run.error ?? (run.signal ? 'Cancelled' : `Command failed (exit ${run.exit}). See Output.`) }
}

async function storeResult(run: Run, stdout: string) {
  const at = Date.now()
  const offset = Number(run.args?.offset ?? 0)
  const s = dropStalePages(await chrome.storage.local.get(['failedSyncs', 'projects', 'projectConnections', 'connections', 'fittingRooms', 'pins'])) as {
    failedSyncs?: FailedSyncs; projects?: Projects; projectConnections?: ProjectConnections; connections?: Connections; fittingRooms?: FittingRooms; pins?: Pins
  }
  if (run.command === 'failed-syncs') {
    const next = outcome<FailedSyncs>(s.failedSyncs, { at: 0, runId: run.id, rows: [], truncated: false }, run, () => ({ at, runId: run.id, ...parseFailedSyncs(stdout) }))
    return chrome.storage.local.set({ failedSyncs: next })
  }
  // Browse commands: a page per query; "load more" runs append to it (mergePage).
  const empty = <Q>(query: Q) => ({ at, runId: run.id, query, rows: [], hasMore: false })
  if (run.command === 'projects') {
    const query = queryOf<ProjectsQuery>(run.args, ['q', 'status', 'sort'])
    const next = outcome<Projects>(s.projects, empty(query), run, () => mergePage(s.projects, query, offset, parseProjects(stdout), at, run.id, p => p.id))
    const pins = s.pins && refreshPins(s.pins, next.rows)
    return chrome.storage.local.set(pins ? { projects: next, pins } as Record<string, unknown> : { projects: next })
  }
  if (run.command === 'project-connections' && run.args?.project) {
    const id = run.args.project
    const cache = s.projectConnections ?? {}
    const query = queryOf<ConnectionsQuery>(run.args, ['q', 'sort'])
    const next = outcome<ProjectConnections[string]>(cache[id], empty(query), run, () => mergePage(cache[id], query, offset, parseProjectConnections(stdout), at, run.id, c => c.connectionId))
    return chrome.storage.local.set({ projectConnections: cacheProject(cache, id, next) })
  }
  if (run.command === 'connections') {
    const query = queryOf<TextQuery>(run.args, ['q'])
    const next = outcome<Connections>(s.connections, empty(query), run, () => mergePage(s.connections, query, offset, parseConnections(stdout), at, run.id, c => c.connectionId))
    return chrome.storage.local.set({ connections: next })
  }
  if (run.command === 'fitting-rooms') {
    const query = queryOf<TextQuery>(run.args, ['q'])
    const next = outcome<FittingRooms>(s.fittingRooms, empty(query), run, () => mergePage(s.fittingRooms, query, offset, parseFittingRooms(stdout), at, run.id, r => r.id))
    return chrome.storage.local.set({ fittingRooms: next })
  }
}

// A worker restart mid-run loses the port and the in-memory buffer; close the stored run so the UI doesn't spin forever.
export async function closeOrphanRun() {
  const { run } = (await chrome.storage.local.get('run')) as { run?: Run }
  if (run && !run.endedAt && !current) await chrome.storage.local.set({ run: { ...run, endedAt: Date.now(), error: 'Interrupted: the extension restarted' } })
}
