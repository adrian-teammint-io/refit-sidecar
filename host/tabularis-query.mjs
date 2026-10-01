// Runs one fixed, read-only SQL file through Tabularis's MCP server (stdio JSON-RPC) and prints the result JSON
// ({columns, rows, truncated, pagination}) to stdout. Progress goes to stderr so the drawer's terminal shows it.
// Tabularis holds the DB credentials, so this repo never sees them.
// Usage: node tabularis-query.mjs <tabularis binary> <connection id> <sql file> <row limit> [--param value ...]
// Params fill the SQL's typed placeholders through bindParams() (protocol.mjs); see PARAMS there for the types.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { bindParams, stripLeadingComments } from './protocol.mjs'

const [bin, connectionId, sqlFile, limit, ...rest] = process.argv.slice(2)
const TIMEOUT_MS = 60_000
const say = s => process.stderr.write(s + '\n')
const refuse = msg => { say(`Refusing ${sqlFile}: ${msg}`); process.exit(2) }

const params = {}
for (let i = 0; i < rest.length; i += 2) {
  if (!rest[i].startsWith('--') || rest[i + 1] === undefined) refuse(`bad param list near ${JSON.stringify(rest[i])}`)
  params[rest[i].slice(2)] = rest[i + 1]
}
let query
try { query = bindParams(stripLeadingComments(readFileSync(sqlFile, 'utf8')), params) } catch (e) { refuse(e.message) }
// ponytail: belt-and-braces read-only check on a SQL file we wrote; a read-only DB role would be the real guard
if (!/^(select|with)\b/i.test(query) || /;\s*\S/.test(query)) refuse('only a single SELECT is allowed')

const started = Date.now()
const shown = Object.entries(params).map(([k, v]) => `${k}=${k === 'q' ? JSON.stringify(Buffer.from(v, 'hex').toString('utf8')) : v}`).join(' ')
say(`$ tabularis --mcp  ·  run_query on ${connectionId}  ·  ${sqlFile}${shown ? `  ·  ${shown}` : ''}`)
const tab = spawn(bin, ['--mcp'], { stdio: ['pipe', 'pipe', 'pipe'] })
const tail = [] // last lines of Tabularis's own log, shown only if something goes wrong
tab.stderr.setEncoding('utf8').on('data', d => { tail.push(...d.split('\n').filter(Boolean)); tail.splice(0, Math.max(0, tail.length - 20)) })
tab.on('error', e => fail(`Could not start Tabularis (${bin}): ${e.message}`, 127))
const timer = setTimeout(() => fail(`Timed out after ${TIMEOUT_MS / 1000}s`, 124), TIMEOUT_MS)
process.on('SIGTERM', () => { tab.kill('SIGTERM'); say('Cancelled'); process.exit(143) })

function fail(msg, code = 1) {
  say(msg)
  if (tail.length) say('--- tabularis log ---\n' + tail.join('\n'))
  tab.kill()
  process.exit(code)
}

let buf = ''
tab.stdout.setEncoding('utf8').on('data', d => {
  buf += d
  let i
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    let msg
    try { msg = JSON.parse(line) } catch { continue } // not a JSON-RPC line
    if (msg) onReply(msg)
  }
})

function onReply(msg) {
  if (msg.id === 1) {
    if (msg.error) return fail(`initialize failed: ${msg.error.message}`)
    say(`connected to ${msg.result?.serverInfo?.name ?? 'tabularis'} ${msg.result?.serverInfo?.version ?? ''}`.trim())
    rpc({ method: 'notifications/initialized' })
    rpc({ id: 2, method: 'tools/call', params: { name: 'run_query', arguments: { connection_id: connectionId, query, limit: Number(limit), output_format: 'json' } } })
  } else if (msg.id === 2) {
    if (msg.error) return fail(`run_query failed: ${msg.error.message}`)
    const text = (msg.result?.content ?? []).map(c => c.text ?? '').join('\n')
    if (msg.result?.isError) return fail(`run_query error: ${text}`)
    let rows = '?'
    try { rows = JSON.parse(text).rows.length } catch {}
    say(`${rows} row${rows === 1 ? '' : 's'} in ${Date.now() - started}ms`)
    clearTimeout(timer)
    tab.kill()
    process.stdout.write(text + '\n', () => process.exit(0))
  }
}

const rpc = m => tab.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n')
rpc({ id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'refit-sidecar', version: '1' } } })
