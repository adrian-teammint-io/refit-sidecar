// Pure terminal-output helpers shared by the worker (buffering) and the UI (status line). No chrome or DOM APIs.

export type Line = { s: 'out' | 'err' | 'sys'; t: string }

// ponytail: the worker keeps the last 2000 lines of a run and counts the rest as dropped; raise it if long logs matter
export const MAX_LINES = 2000
// ponytail: lines longer than this are clipped for display (raw stdout for parsing is kept separately)
export const MAX_LINE_CHARS = 2000

// CSI (colours, cursor moves), OSC (titles, hyperlinks) and two-char escapes.
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g
export const stripAnsi = (s: string) => s.replace(ANSI, '')

// One terminal line: drops ANSI, keeps only what follows the last carriage return (progress bars redraw with \r).
function clean(raw: string) {
  let t = stripAnsi(raw.endsWith('\r') ? raw.slice(0, -1) : raw)
  const cr = t.lastIndexOf('\r')
  if (cr >= 0) t = t.slice(cr + 1)
  return t.length > MAX_LINE_CHARS ? t.slice(0, MAX_LINE_CHARS) + ' …' : t
}

// Splits a chunk into complete lines; a trailing partial line is carried into the next call.
export function splitChunk(carry: string, chunk: string): { lines: string[]; carry: string } {
  const parts = (carry + chunk).split('\n')
  const rest = parts.pop()!
  return { lines: parts.map(clean), carry: rest }
}
export const flushCarry = (carry: string) => (carry ? [clean(carry)] : [])

// Appends and keeps only the last `max` lines; returns how many were dropped from the front.
export function pushLines(buf: Line[], add: Line[], max = MAX_LINES): number {
  buf.push(...add)
  const over = buf.length - max
  if (over > 0) buf.splice(0, over)
  return Math.max(0, over)
}

export function duration(ms: number) {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

// "1 member", "3 members"
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function ago(t: number, now: number) {
  const m = Math.floor((now - t) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`
}

export type RunInfo = { startedAt: number; endedAt?: number; exit?: number; signal?: string; error?: string }
export type Tone = 'run' | 'ok' | 'fail'

// Finished clean: exit 0, no host error. (A cancelled run has a signal and no exit code.)
export const runOk = (r: RunInfo) => r.exit === 0 && !r.error

// Status pill text for a run: "running · 3.2s", "exit 0 · 1.0s", "cancelled · 4.1s", or the host error.
export function runStatus(r: RunInfo, now: number): { tone: Tone; label: string } {
  const took = duration((r.endedAt ?? now) - r.startedAt)
  if (!r.endedAt) return { tone: 'run', label: `running · ${took}` }
  if (r.error) return { tone: 'fail', label: r.error }
  if (r.signal) return { tone: 'fail', label: `cancelled · ${took}` }
  return { tone: r.exit === 0 ? 'ok' : 'fail', label: `exit ${r.exit} · ${took}` }
}
