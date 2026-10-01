// Native messaging host. Chrome starts it (through the refit-sidecar-host wrapper that install.mjs writes) when the
// worker calls connectNative, and it lives as long as that port. It only runs commands listed in commands.json.
// Requests:  {id, type: 'hello'} | {id, type: 'run', command, args} | {id, type: 'cancel'}
// Replies:   {id, hello} | {id, stream: 'stdout'|'stderr', chunk} | {id, exit, signal?, ms} | {id, error}
// stdout is the protocol channel: never console.log here. Everything is also appended to LOG (tail -f it).
import { spawn } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { constants, homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildArgv, decoder, encode, takeChunks } from './protocol.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const LOG = process.env.REFIT_SIDECAR_LOG ?? join(homedir(), 'Library/Logs/refit-sidecar.log')
const IDLE_FLUSH_MS = 100 // send a partial line (e.g. a progress prompt) if no newline arrives for this long
const KILL_GRACE_MS = 3000

const send = msg => process.stdout.write(encode(msg))
const log = text => { try { appendFileSync(LOG, text.endsWith('\n') ? text : text + '\n') } catch {} }
const stamp = () => new Date().toISOString()

function loadCommands() {
  const { commands } = JSON.parse(readFileSync(process.env.REFIT_SIDECAR_COMMANDS ?? join(HERE, 'commands.json'), 'utf8')) // env override is for host.test.mjs
  for (const [name, c] of Object.entries(commands)) {
    if (c.exec !== 'node' && !isAbsolute(c.exec)) throw new Error(`${name}: exec must be "node" or an absolute path`)
    if (!Array.isArray(c.args) || !c.args.every(a => typeof a === 'string')) throw new Error(`${name}: args must be strings`)
  }
  return commands
}

// ponytail: one command at a time; the protocol carries ids, so allowing parallel runs is a small change here
const runs = new Map() // id -> child process

function killGroup(child, signal) {
  try { process.kill(-child.pid, signal) } catch {} // detached: the child leads its own group, so this reaches grandchildren
}

function run({ id, command, args }) {
  let commands
  try { commands = loadCommands() } catch (e) { return send({ id, error: `commands.json: ${e.message}` }) } // re-read each run: edits apply without a restart
  const spec = typeof command === 'string' && Object.hasOwn(commands, command) ? commands[command] : undefined
  if (!spec) return send({ id, error: `Unknown command: ${String(command).slice(0, 60)}` })
  if (runs.size) return send({ id, error: 'Another command is running' })
  let argv
  try { argv = buildArgv(spec, args ?? {}) } catch (e) { return send({ id, error: e.message }) }

  const exe = spec.exec === 'node' ? process.execPath : spec.exec
  const started = Date.now()
  log(`\n[${stamp()}] $ ${command}  (${[exe, ...argv].join(' ')})`)
  const child = spawn(exe, argv, { cwd: HERE, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  runs.set(id, child)
  let done = false
  const finish = (exit, signal) => {
    if (done) return
    done = true
    runs.delete(id)
    clearTimeout(timeout)
    const ms = Date.now() - started
    log(`[${stamp()}] exit ${exit}${signal ? ` (${signal})` : ''} in ${ms}ms`)
    send({ id, exit, signal: signal ?? undefined, ms })
  }
  const timeout = spec.timeoutMs ? setTimeout(() => cancel({ id }), spec.timeoutMs) : undefined

  for (const stream of ['stdout', 'stderr']) {
    let carry = ''
    let timer
    const flush = all => {
      clearTimeout(timer)
      const r = takeChunks(carry, all)
      carry = r.carry
      for (const chunk of r.chunks) { send({ id, stream, chunk }); log(chunk) }
      if (carry) timer = setTimeout(() => flush(true), IDLE_FLUSH_MS)
    }
    child[stream].setEncoding('utf8') // keeps multi-byte characters whole across data events
    child[stream].on('data', d => { carry += d; flush(false) })
    child[stream].on('end', () => flush(true))
  }
  child.on('error', e => {
    send({ id, stream: 'stderr', chunk: `Failed to start ${command}: ${e.message}\n` })
    finish(127)
  })
  child.on('close', (code, signal) => finish(code ?? 128 + (constants.signals[signal] ?? 0), signal))
}

function cancel({ id }) {
  const child = runs.get(id) ?? (id === undefined ? [...runs.values()][0] : undefined)
  if (!child) return send({ id, error: 'Nothing to cancel' })
  log(`[${stamp()}] cancel`)
  killGroup(child, 'SIGTERM')
  setTimeout(() => { if (child.exitCode === null && child.signalCode === null) killGroup(child, 'SIGKILL') }, KILL_GRACE_MS).unref()
}

function onMessage(msg) {
  const id = msg?.id
  switch (msg?.type) {
    case 'hello':
      try { return send({ id, hello: { version: 1, commands: Object.keys(loadCommands()), log: LOG } }) }
      catch (e) { return send({ id, error: `commands.json: ${e.message}` }) }
    case 'run': return run(msg)
    case 'cancel': return cancel(msg)
    default: return send({ id, error: `Unknown request type: ${String(msg?.type).slice(0, 40)}` })
  }
}

const feed = decoder(m => { try { onMessage(m) } catch (e) { log(`[${stamp()}] error ${e.stack}`) } })
process.stdin.on('data', feed)
// Chrome closed the port (worker gone, extension reloaded, browser quit): take running commands down with us.
process.stdin.on('end', () => {
  for (const child of runs.values()) killGroup(child, 'SIGTERM')
  process.exit(0)
})
log(`[${stamp()}] host started (pid ${process.pid})`)
