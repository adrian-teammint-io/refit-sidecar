// Worker side of the native host: owns the one connectNative port (to the relay, host/host.mjs, which forwards to
// `pnpm server` in a terminal), runs commands, buffers their output. Surfaces never see the port.
// They read `host` / `output` (storage.session) and `run` / `failedSyncs` (storage.local).
import type { Args, Command, HostState, Output, Run } from './api'
import { flushCarry, pushLines, splitChunk, type Line } from './term'
import { parseFailedSyncs, type FailedSyncs } from './failed-syncs'
import { parseProjects, parseProjectConnections, cacheProject, type Projects, type ProjectConnections } from './projects'

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

type Current = { run: Run; out: Output; carry: { out: string; err: string }; stdout: string }

let port: chrome.runtime.Port | undefined
let current: Current | undefined
let flushTimer: ReturnType<typeof setTimeout> | undefined
let retryMs = 1000
let retryTimer: ReturnType<typeof setTimeout> | undefined

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

export function startRun(command: Command, args: Args = {}): string {
  if (current) throw new Error(`Busy: ${current.run.command} is still running`)
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
  const run: Run = { ...c.run, ...end, endedAt: Date.now() }
  clearTimeout(flushTimer)
  flushTimer = undefined
  await chrome.storage.session.set({ output: c.out })
  await storeResult(run, c.stdout)
  await chrome.storage.local.set({ run })
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
  const base = { at: 0, runId: run.id, rows: [] }
  const s = (await chrome.storage.local.get(['failedSyncs', 'projects', 'projectConnections'])) as {
    failedSyncs?: FailedSyncs; projects?: Projects; projectConnections?: ProjectConnections
  }
  if (run.command === 'failed-syncs') {
    const next = outcome<FailedSyncs>(s.failedSyncs, { ...base, truncated: false }, run, () => ({ at, runId: run.id, ...parseFailedSyncs(stdout) }))
    await chrome.storage.local.set({ failedSyncs: next })
  } else if (run.command === 'projects') {
    const next = outcome<Projects>(s.projects, base, run, () => ({ at, runId: run.id, rows: parseProjects(stdout) }))
    await chrome.storage.local.set({ projects: next })
  } else if (run.command === 'project-connections' && run.args?.project) {
    const id = run.args.project
    const cache = s.projectConnections ?? {}
    const next = outcome<ProjectConnections[string]>(cache[id], base, run, () => ({ at, runId: run.id, rows: parseProjectConnections(stdout) }))
    await chrome.storage.local.set({ projectConnections: cacheProject(cache, id, { ...next, at: next.at || at }) })
  }
}

// A worker restart mid-run loses the port and the in-memory buffer; close the stored run so the UI doesn't spin forever.
export async function closeOrphanRun() {
  const { run } = (await chrome.storage.local.get('run')) as { run?: Run }
  if (run && !run.endedAt && !current) await chrome.storage.local.set({ run: { ...run, endedAt: Date.now(), error: 'Interrupted: the extension restarted' } })
}
