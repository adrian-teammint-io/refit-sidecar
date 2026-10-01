// node host/host.test.mjs: pure protocol checks, then the real host.mjs driven over stdio with a test allowlist.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildArgv, decoder, encode, takeChunks } from './protocol.mjs'

// framing round trip, including a frame split across reads and two frames in one read
const got = []
const feed = decoder(m => got.push(m))
const two = Buffer.concat([encode({ a: 'é' }), encode({ b: 2 })])
feed(two.subarray(0, 3)); feed(two.subarray(3, 9)); feed(two.subarray(9))
assert.deepEqual(got, [{ a: 'é' }, { b: 2 }])
assert.equal(encode({ x: 1 }).readUInt32LE(0), Buffer.byteLength('{"x":1}'))

// chunking: whole lines only, unless the stream ended or a line is longer than max
assert.deepEqual(takeChunks('a\nb\npart', false), { chunks: ['a\nb\n'], carry: 'part' })
assert.deepEqual(takeChunks('part', false), { chunks: [], carry: 'part' })
assert.deepEqual(takeChunks('part', true), { chunks: ['part'], carry: '' })
assert.deepEqual(takeChunks('aaaa\nbb\ncc\n', false, 6), { chunks: ['aaaa\n', 'bb\ncc\n'], carry: '' })
assert.deepEqual(takeChunks('xxxxxxxxxx', false, 4), { chunks: ['xxxx', 'xxxx'], carry: 'xx' })
const big = takeChunks(('y'.repeat(99) + '\n').repeat(5000), true)
assert.ok(big.chunks.every(c => c.length <= 64 * 1024) && big.chunks.join('').length === 500000)

// argv: placeholders are whole args, params are declared and fully matched
const spec = { args: ['--env', '{env}', 'x{env}'], params: { env: { pattern: 'prod|staging', default: 'prod' } } }
assert.deepEqual(buildArgv(spec, {}), ['--env', 'prod', 'x{env}'])
assert.deepEqual(buildArgv(spec, { env: 'staging' }), ['--env', 'staging', 'x{env}'])
assert.throws(() => buildArgv(spec, { env: 'prod; rm -rf ~' }), /Invalid env/)
assert.throws(() => buildArgv(spec, { env: 'prodx' }), /Invalid env/) // anchored: no partial match
assert.throws(() => buildArgv(spec, { env: ['prod'] }), /Missing param/)
assert.throws(() => buildArgv(spec, { other: '1' }), /Unknown param/)
assert.throws(() => buildArgv({ args: [] }, { __proto__: { a: 1 }, b: '1' }), /Unknown param/)
assert.throws(() => buildArgv({ args: [] }, 'x'), /object/)

// end to end against host.mjs
const dir = mkdtempSync(join(tmpdir(), 'refit-host-'))
const cfg = join(dir, 'commands.json')
const log = join(dir, 'host.log')
writeFileSync(cfg, JSON.stringify({ commands: {
  echo: { exec: 'node', args: ['-e', 'console.log("one\\ntwo"); console.error("\\u001b[31mwarn\\u001b[0m"); process.exit(3)'] },
  greet: { exec: 'node', args: ['-e', 'console.log("hi " + process.argv[1])', '{name}'], params: { name: { pattern: '[a-z]{1,10}' } } },
  sleep: { exec: 'node', args: ['-e', 'console.log("start"); setTimeout(() => {}, 30000)'] },
  flood: { exec: 'node', args: ['-e', 'process.stdout.write(("z".repeat(199) + "\\n").repeat(5000))'] },
} }))
const host = spawn(process.execPath, [join(import.meta.dirname, 'host.mjs')], { env: { ...process.env, REFIT_SIDECAR_COMMANDS: cfg, REFIT_SIDECAR_LOG: log }, stdio: ['pipe', 'pipe', 'inherit'] })
const inbox = []
let wake = () => {}
host.stdout.on('data', decoder(m => { inbox.push(m); wake() }))
const send = m => host.stdin.write(encode(m))
async function until(id, pred = m => 'exit' in m || 'error' in m || 'hello' in m) {
  for (;;) {
    const mine = inbox.filter(m => m.id === id)
    if (mine.some(pred)) return mine
    await new Promise(r => { wake = r; setTimeout(r, 5000) })
  }
}
const out = (msgs, s) => msgs.filter(m => m.stream === s).map(m => m.chunk).join('')

send({ id: 'h', type: 'hello' })
assert.deepEqual((await until('h')).at(-1).hello.commands, ['echo', 'greet', 'sleep', 'flood'])

send({ id: 'e', type: 'run', command: 'echo', args: {} })
let r = await until('e')
assert.equal(out(r, 'stdout'), 'one\ntwo\n')
assert.equal(out(r, 'stderr'), '\u001b[31mwarn\u001b[0m\n') // ANSI passes through; the UI strips it
assert.equal(r.at(-1).exit, 3)

send({ id: 'g', type: 'run', command: 'greet', args: { name: 'refit' } })
assert.equal(out(await until('g'), 'stdout'), 'hi refit\n')
send({ id: 'g2', type: 'run', command: 'greet', args: { name: '$(whoami)' } })
assert.match((await until('g2')).at(-1).error, /Invalid name/)
send({ id: 'u', type: 'run', command: 'rm', args: {} })
assert.match((await until('u')).at(-1).error, /Unknown command/)
send({ id: 'p', type: 'run', command: '__proto__', args: {} })
assert.match((await until('p')).at(-1).error, /Unknown command/)

send({ id: 'f', type: 'run', command: 'flood', args: {} })
r = await until('f')
assert.equal(out(r, 'stdout').length, 200 * 5000)
assert.ok(r.every(m => JSON.stringify(m).length < 1024 * 1024))

send({ id: 's', type: 'run', command: 'sleep', args: {} })
await until('s', m => m.chunk === 'start\n')
send({ id: 'busy', type: 'run', command: 'echo', args: {} })
assert.match((await until('busy')).at(-1).error, /already|Another/)
send({ id: 's', type: 'cancel' })
r = await until('s')
assert.equal(r.at(-1).signal, 'SIGTERM')
assert.equal(r.at(-1).exit, 143)

host.stdin.end()
await new Promise(r => host.on('close', r))
assert.match(readFileSync(log, 'utf8'), /\$ echo[\s\S]*exit 3/)
console.log('host ok')
