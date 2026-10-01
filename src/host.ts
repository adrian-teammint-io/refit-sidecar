// Worker side of the native host: owns the one connectNative port, runs commands, buffers their output.
// Surfaces never see the port. They read `host` / `output` (storage.session) and `run` / `failedSyncs` (storage.local).
import type { Command, HostState, Output, Run } from './api'
import { flushCarry, pushLines, splitChunk, type Line } from './term'
import { parseFailedSyncs, type FailedSyncs } from './failed-syncs'

export const HOST = 'com.hoan.refit_sidecar' // keep in sync with NAME in host/install.mjs
const FLUSH_MS = 120 // throttle for storage writes while output streams
const MAX_STDOUT = 8 * 1024 * 1024 // ponytail: raw stdout kept for the parser; a bigger result fails to parse
const RETRY_MAX_MS = 60_000

type HostMsg =
  | { id: string; hello: { commands: string[]; log: string } }
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
  p.postMessage({ id: 'hello', type: 'hello' })
  return p
}

export function startRun(command: Command): string {
  if (current) throw new Error('A command is already running')
  const p = connect()
  const id = crypto.randomUUID()
  current = {
    run: { id, command, startedAt: Date.now() },
    out: { runId: id, lines: [{ s: 'sys', t: `$ ${command}` }], dropped: 0 },
    carry: { out: '', err: '' },
    stdout: '',
  }
  chrome.storage.local.set({ run: current.run })
  chrome.storage.session.set({ output: current.out })
  p.postMessage({ id, type: 'run', command, args: {} })
  return id
}

export function cancelRun() {
  if (!current) throw new Error('Nothing is running')
  port?.postMessage({ id: current.run.id, type: 'cancel' })
  append([{ s: 'sys', t: '^C cancelling…' }])
}

function onMessage(m: HostMsg) {
  if (m.id === 'hello') {
    if ('hello' in m) { retryMs = 1000; setHost({ state: 'ready', commands: m.hello.commands, log: m.hello.log }) }
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
  if (run.command === 'failed-syncs') await storeFailedSyncs(run, c.stdout)
  await chrome.storage.local.set({ run })
}

async function storeFailedSyncs(run: Run, stdout: string) {
  const { failedSyncs: prev } = (await chrome.storage.local.get('failedSyncs')) as { failedSyncs?: FailedSyncs }
  let next: FailedSyncs
  if (run.exit === 0 && !run.error) {
    try { next = { at: Date.now(), runId: run.id, ...parseFailedSyncs(stdout) } }
    catch (e) { next = { ...(prev ?? { rows: [], truncated: false, runId: run.id, at: 0 }), error: `Could not read output: ${(e as Error).message}` } }
  } else {
    // keep the last good rows on screen, flagged with what went wrong
    const why = run.error ?? (run.signal ? 'Cancelled' : `Command failed (exit ${run.exit}). See Output.`)
    next = { ...(prev ?? { rows: [], truncated: false, runId: run.id, at: 0 }), error: why }
  }
  await chrome.storage.local.set({ failedSyncs: next })
}

// A worker restart mid-run loses the port and the in-memory buffer; close the stored run so the UI doesn't spin forever.
export async function closeOrphanRun() {
  const { run } = (await chrome.storage.local.get('run')) as { run?: Run }
  if (run && !run.endedAt && !current) await chrome.storage.local.set({ run: { ...run, endedAt: Date.now(), error: 'Interrupted: the extension restarted' } })
}
