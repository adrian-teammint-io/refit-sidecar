// node host/host.test.mjs: pure protocol checks, then the real relay (host.mjs) + server (server.mjs) with a test allowlist.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bindParams, buildArgv, decoder, encode, stripLeadingComments, takeChunks, toHex } from './protocol.mjs'

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

// SQL placeholders: typed, all required, none extra; free text only ever arrives as hex
const P = '799a63f3-235c-46ce-9141-12e28915539f'
const q = "SELECT to_char(x, 'HH24:MI:SS'), c.id::text FROM c WHERE c.project_id = :project_id AND strpos(lower(c.name), lower(:q)) > 0 AND (:status = 'all') ORDER BY :sort LIMIT 31 OFFSET :offset"
const bound = bindParams(q, { project_id: P.toUpperCase(), q: toHex("it's 50%"), status: 'ACTIVE', sort: 'service', offset: '030' })
assert.equal(bound, `SELECT to_char(x, 'HH24:MI:SS'), c.id::text FROM c WHERE c.project_id = '${P}' AND strpos(lower(c.name), lower(convert_from(decode('${toHex("it's 50%")}', 'hex'), 'UTF8'))) > 0 AND ('ACTIVE' = 'all') ORDER BY 'service' LIMIT 31 OFFSET 30`)
assert.ok(!bound.includes("it's")) // the quote never reaches SQL as text
const ok = { project_id: P, q: '', status: 'all', sort: 'name', offset: '0' }
assert.throws(() => bindParams(q, { ...ok, project_id: "x' OR '1'='1" }), /project_id must be a UUID/)
assert.throws(() => bindParams(q, { ...ok, project_id: `${P}; DROP TABLE x` }), /UUID/)
assert.throws(() => bindParams(q, { ...ok, q: "61'" }), /q must be hex/)
assert.throws(() => bindParams(q, { ...ok, q: '6' }), /q must be hex/) // odd length
assert.throws(() => bindParams(q, { ...ok, q: '61'.repeat(201) }), /max 200/)
assert.throws(() => bindParams(q, { ...ok, offset: '1 OR 1=1' }), /offset must be a whole number/)
assert.throws(() => bindParams(q, { ...ok, offset: '123456' }), /offset/)
assert.throws(() => bindParams(q, { ...ok, status: "all' OR 'x" }), /status must be one of/)
assert.throws(() => bindParams(q, { ...ok, sort: 'name; DROP' }), /sort must be one of/)
assert.throws(() => bindParams(q, { ...ok, offset: undefined }), /Missing offset/)
assert.throws(() => bindParams('SELECT 1', { project_id: P }), /takes no project_id/)
assert.equal(bindParams('SELECT 1'), 'SELECT 1')
assert.equal(stripLeadingComments('-- a\n  -- b\nSELECT 1 -- c\n'), 'SELECT 1 -- c')

// end to end: Chrome's side of host.mjs (the relay) -> unix socket -> server.mjs
const dir = mkdtempSync(join(tmpdir(), 'refit-host-'))
const cfg = join(dir, 'commands.json')
const env = { ...process.env, REFIT_SIDECAR_COMMANDS: cfg, REFIT_SIDECAR_SOCK: join(dir, 's.sock') }
writeFileSync(cfg, JSON.stringify({ commands: {
  echo: { exec: 'node', args: ['-e', 'console.log("one\\ntwo"); console.error("\\u001b[31mwarn\\u001b[0m"); process.exit(3)'] },
  greet: { exec: 'node', args: ['-e', 'console.log("hi " + process.argv[1])', '{name}'], params: { name: { pattern: '[a-z]{1,10}' } } },
  sleep: { exec: 'node', args: ['-e', 'console.log("start"); setTimeout(() => {}, 30000)'] },
  flood: { exec: 'node', args: ['-e', 'process.stdout.write(("z".repeat(199) + "\\n").repeat(5000))'] },
} }))
const host = spawn(process.execPath, [join(import.meta.dirname, 'host.mjs')], { env, stdio: ['pipe', 'pipe', 'inherit'] })
const inbox = []
let wake = () => {}
host.stdout.on('data', decoder(m => { inbox.push(m); wake() }))
const send = m => host.stdin.write(encode(m))
async function until(id, pred = m => 'exit' in m || 'error' in m || 'hello' in m, from = 0) {
  const deadline = Date.now() + 15_000
  for (;;) {
    const mine = inbox.slice(from).filter(m => m.id === id)
    if (mine.some(pred)) return mine
    assert.ok(Date.now() < deadline, `timed out waiting for ${id}`)
    await new Promise(r => { wake = r; setTimeout(r, 200) })
  }
}
const out = (msgs, s) => msgs.filter(m => m.stream === s).map(m => m.chunk).join('')
let server
let terminal = ''
const startServer = async () => {
  server = spawn(process.execPath, [join(import.meta.dirname, 'server.mjs')], { env, stdio: ['ignore', 'pipe', 'inherit'] })
  server.stdout.setEncoding('utf8').on('data', d => { terminal += d })
  await until('status', m => m.server === 'up', inbox.length)
}

// relay without a server: reports down, and refuses runs with a hint instead of hanging
await until('status', m => m.server === 'down')
send({ id: 'early', type: 'run', command: 'echo', args: {} })
assert.match((await until('early')).at(-1).error, /pnpm server/)

// starting the server flips the relay to up on its own (retry loop)
await startServer()
assert.match(terminal, /listening on/)
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

// the terminal saw every run as it happened
assert.match(terminal, /extension connected[\s\S]*▶ echo[\s\S]*one\ntwo[\s\S]*exit 3/)
assert.match(terminal, /cancel requested[\s\S]*exit 143/)

// a second server refuses to start while the first owns the socket
const second = spawn(process.execPath, [join(import.meta.dirname, 'server.mjs')], { env, stdio: 'pipe' })
assert.equal(await new Promise(r => second.on('close', r)), 1)

// stopping the server: relay reports down live, then up again on restart
const mark = inbox.length
server.kill('SIGINT')
await until('status', m => m.server === 'down', mark)
await startServer()
send({ id: 'again', type: 'run', command: 'greet', args: { name: 'back' } })
assert.equal(out(await until('again'), 'stdout'), 'hi back\n')

host.stdin.end()
await new Promise(r => host.on('close', r))
server.kill('SIGINT')
await new Promise(r => server.on('close', r))
console.log('host ok')
