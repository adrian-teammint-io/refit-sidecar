// The terminal server: `pnpm server`, keep it open. It listens on a unix socket (only your user can open it; browsers
// can't reach unix sockets at all), runs allowlisted commands from commands.json for the extension, prints every run
// here live, and streams the output back. host.mjs (started by Chrome) is just a relay between the extension and this.
// Requests:  {id, type: 'hello'} | {id, type: 'run', command, args} | {id, type: 'cancel'}
// Replies:   {id, hello} | {id, stream: 'stdout'|'stderr', chunk} | {id, exit, signal?, ms} | {id, error}
import { spawn } from 'node:child_process'
import { chmodSync, readFileSync, rmSync } from 'node:fs'
import { createConnection, createServer } from 'node:net'
import { constants } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SOCK, buildArgv, decoder, encode, takeChunks } from './protocol.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const IDLE_FLUSH_MS = 100 // send a partial line (e.g. a progress prompt) if no newline arrives for this long
const KILL_GRACE_MS = 3000

// Terminal output. Colours only on a TTY (and not with NO_COLOR).
const tty = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s)
const dim = s => paint('2', s), bold = s => paint('1', s), red = s => paint('31', s), green = s => paint('32', s), yellow = s => paint('33', s)
const time = () => new Date().toLocaleTimeString([], { hourCycle: 'h23' })
const say = s => process.stdout.write(s + '\n')
const echo = (stream, chunk) => process.stdout.write(stream === 'stderr' ? yellow(chunk) : chunk)

function loadCommands() {
  const { commands } = JSON.parse(readFileSync(process.env.REFIT_SIDECAR_COMMANDS ?? join(HERE, 'commands.json'), 'utf8')) // env override is for host.test.mjs
  for (const [name, c] of Object.entries(commands)) {
    if (c.exec !== 'node' && !isAbsolute(c.exec)) throw new Error(`${name}: exec must be "node" or an absolute path`)
    if (!Array.isArray(c.args) || !c.args.every(a => typeof a === 'string')) throw new Error(`${name}: args must be strings`)
  }
  return commands
}

// ponytail: one command at a time; the protocol carries ids, so allowing parallel runs is a small change here
const runs = new Map() // id -> { child, conn }

function killGroup(child, signal) {
  try { process.kill(-child.pid, signal) } catch {} // detached: the child leads its own group, so this reaches grandchildren
}

function run(send, conn, { id, command, args }) {
  let commands
  try { commands = loadCommands() } catch (e) { return send({ id, error: `commands.json: ${e.message}` }) } // re-read each run: edits apply without a restart
  const spec = typeof command === 'string' && Object.hasOwn(commands, command) ? commands[command] : undefined
  if (!spec) return send({ id, error: `Unknown command: ${String(command).slice(0, 60)}` })
  if (runs.size) return send({ id, error: 'Another command is running' })
  let argv
  try { argv = buildArgv(spec, args ?? {}) } catch (e) { return send({ id, error: e.message }) }

  const exe = spec.exec === 'node' ? process.execPath : spec.exec
  const started = Date.now()
  say(`\n${dim(time())} ${bold(`▶ ${command}`)}  ${dim([exe, ...argv].join(' '))}`)
  const child = spawn(exe, argv, { cwd: HERE, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  runs.set(id, { child, conn })
  let done = false
  const finish = (exit, signal) => {
    if (done) return
    done = true
    runs.delete(id)
    clearTimeout(timeout)
    const ms = Date.now() - started
    const took = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
    say(`${dim(time())} ${exit === 0 ? green(`✓ exit 0 in ${took}`) : red(`✗ exit ${exit}${signal ? ` (${signal})` : ''} in ${took}`)}`)
    send({ id, exit, signal: signal ?? undefined, ms })
  }
  const timeout = spec.timeoutMs ? setTimeout(() => cancel(send, { id }), spec.timeoutMs) : undefined

  for (const stream of ['stdout', 'stderr']) {
    let carry = ''
    let timer
    const flush = all => {
      clearTimeout(timer)
      const r = takeChunks(carry, all)
      carry = r.carry
      for (const chunk of r.chunks) { send({ id, stream, chunk }); echo(stream, chunk) }
      if (carry) timer = setTimeout(() => flush(true), IDLE_FLUSH_MS)
    }
    child[stream].setEncoding('utf8') // keeps multi-byte characters whole across data events
    child[stream].on('data', d => { carry += d; flush(false) })
    child[stream].on('end', () => flush(true))
  }
  child.on('error', e => {
    const chunk = `Failed to start ${command}: ${e.message}\n`
    send({ id, stream: 'stderr', chunk })
    echo('stderr', chunk)
    finish(127)
  })
  child.on('close', (code, signal) => finish(code ?? 128 + (constants.signals[signal] ?? 0), signal))
}

function cancel(send, { id }) {
  const r = runs.get(id)
  if (!r) return send({ id, error: 'Nothing to cancel' })
  say(`${dim(time())} ${yellow('^C cancel requested from the browser')}`)
  killGroup(r.child, 'SIGTERM')
  setTimeout(() => { if (r.child.exitCode === null && r.child.signalCode === null) killGroup(r.child, 'SIGKILL') }, KILL_GRACE_MS).unref()
}

function onMessage(send, conn, msg) {
  const id = msg?.id
  switch (msg?.type) {
    case 'hello':
      try { return send({ id, hello: { version: 2, commands: Object.keys(loadCommands()) } }) }
      catch (e) { return send({ id, error: `commands.json: ${e.message}` }) }
    case 'run': return run(send, conn, msg)
    case 'cancel': return cancel(send, msg)
    default: return send({ id, error: `Unknown request type: ${String(msg?.type).slice(0, 40)}` })
  }
}

const server = createServer(conn => {
  say(`${dim(time())} ${green('● extension connected')}`)
  const send = msg => { if (!conn.destroyed) conn.write(encode(msg)) }
  conn.on('data', decoder(m => { try { onMessage(send, conn, m) } catch (e) { say(red(e.stack)) } }))
  conn.on('error', () => {})
  conn.on('close', () => {
    say(`${dim(time())} ${dim('○ extension disconnected')}`)
    for (const [id, r] of runs) if (r.conn === conn) { killGroup(r.child, 'SIGTERM'); runs.delete(id) } // nobody left to read it
  })
})

server.on('error', e => { console.error(`Could not listen on ${SOCK}: ${e.message}${e.code === 'EINVAL' ? ' (unix socket paths max out at 104 chars)' : ''}`); process.exit(1) })

function shutdown() {
  for (const r of runs.values()) killGroup(r.child, 'SIGTERM')
  server.close()
  rmSync(SOCK, { force: true })
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// One server per socket: if another one answers, bail; if the file is a leftover from a crash, replace it.
const probe = createConnection(SOCK)
probe.on('connect', () => { probe.end(); console.error(`refit-sidecar server is already running on ${SOCK}`); process.exit(1) })
probe.on('error', () => {
  rmSync(SOCK, { force: true })
  server.listen(SOCK, () => {
    chmodSync(SOCK, 0o600)
    say(`${bold('refit-sidecar server')} ${dim(`listening on ${SOCK}`)}`)
    say(dim(`commands: ${Object.keys(loadCommands()).join(', ')}   ·   Ctrl+C to stop`))
  })
})
