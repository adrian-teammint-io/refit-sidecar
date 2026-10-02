// Pure helpers shared by the relay (host.mjs) and the server (server.mjs): length-prefixed JSON framing (Chrome's,
// reused on the unix socket), output chunking and argv building. No I/O here so host.test.mjs can run it with plain node.
import { homedir } from 'node:os'
import { join } from 'node:path'

// Unix socket between the relay and the server. The env override is for host.test.mjs.
export const SOCK = process.env.REFIT_SIDECAR_SOCK ?? join(homedir(), '.refit-sidecar.sock')

// Chrome caps host -> extension messages at 1 MB of UTF-8 JSON. 64K chars stays far under it even if every
// char is JSON-escaped (\u0000 is 6 bytes, 64K * 6 = 384 KB).
export const MAX_CHUNK = 64 * 1024

export function encode(msg) {
  const body = Buffer.from(JSON.stringify(msg), 'utf8')
  const head = Buffer.alloc(4)
  head.writeUInt32LE(body.length) // native byte order; every Mac Chrome runs on is little-endian
  return Buffer.concat([head, body])
}

// Feed raw stdin buffers; calls onMessage for every complete frame.
export function decoder(onMessage) {
  let buf = Buffer.alloc(0)
  return chunk => {
    buf = Buffer.concat([buf, chunk])
    while (buf.length >= 4) {
      const len = buf.readUInt32LE(0)
      if (buf.length < 4 + len) break
      const body = buf.subarray(4, 4 + len)
      buf = buf.subarray(4 + len)
      onMessage(JSON.parse(body.toString('utf8')))
    }
  }
}

// Splits buffered output into chunks that end on a line break and are at most `max` chars.
// A single line longer than `max` is cut. With `all`, the trailing partial line is flushed too
// (stream ended, or no newline arrived for a while).
export function takeChunks(carry, all, max = MAX_CHUNK) {
  const chunks = []
  let rest = carry
  for (;;) {
    if (rest.length > max) {
      const nl = rest.lastIndexOf('\n', max - 1)
      const cut = nl >= 0 ? nl + 1 : max
      chunks.push(rest.slice(0, cut))
      rest = rest.slice(cut)
      continue
    }
    const nl = rest.lastIndexOf('\n')
    if (all ? rest : nl >= 0) {
      const cut = all ? rest.length : nl + 1
      chunks.push(rest.slice(0, cut))
      rest = rest.slice(cut)
    }
    return { chunks, carry: rest }
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Tabularis's run_query has no bind parameters, so SQL files use typed placeholders (:name, unquoted) and this
// turns each value into SQL that cannot carry anything else. Free text never appears as text: it arrives as hex
// and is decoded by Postgres, so quotes, backslashes or comments in a search are just characters to match.
const ENUM = (...vals) => v => { if (!vals.includes(v)) throw new Error(`must be one of ${vals.join(', ')}`); return `'${v}'` }
export const PARAMS = {
  project_id: v => { if (!UUID.test(v)) throw new Error('must be a UUID'); return `'${v.toLowerCase()}'` },
  offset: v => { if (!/^\d{1,5}$/.test(v)) throw new Error('must be a whole number'); return String(Number(v)) },
  status: ENUM('all', 'ACTIVE', 'PAUSED'),
  sync_status: ENUM('FAIL', 'IN_PROGRESS', 'FRAGMENTED'), // the drawer's Sync requests tabs (failed-syncs.sql)
  sort: ENUM('active', 'name', 'recent', 'status', 'service'),
  user_id: v => { if (!UUID.test(v)) throw new Error('must be a UUID'); return `'${v.toLowerCase()}'` },
  role: ENUM('admin', 'editor', 'viewer'), // refit_user_role values
  // create-project
  name: v => { // project name: hex of UTF-8, like q, but must not be blank (project has CHECK char_length(name) > 0)
    if (!/^(?:[0-9a-f]{2}){1,200}$/.test(v)) throw new Error('must be hex-encoded text (1-200 bytes)')
    if (!Buffer.from(v, 'hex').toString('utf8').trim()) throw new Error('must not be blank')
    return `convert_from(decode('${v}', 'hex'), 'UTF8')`
  },
  project_status: ENUM('ACTIVE', 'PAUSED', 'NEED_PAYMENT'), // project_status values
  plan: ENUM('BASIC', 'DEMO', 'ENTERPRISE', 'TRIAL'), // project_plan values
  end_date: v => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) throw new Error('must be a real YYYY-MM-DD date')
    return `'${v}'::date`
  },
  // extra members as "uuid:role,uuid:role" (0-50), emitted as a VALUES list (or an empty row set)
  members: v => {
    if (v === '') return '(SELECT NULL::uuid, NULL::text WHERE false)'
    const ms = v.split(',').map(m => m.split(':'))
    if (ms.length > 50 || !ms.every(([id, role, x]) => UUID.test(id ?? '') && ['admin', 'editor', 'viewer'].includes(role) && x === undefined))
      throw new Error('must be 0-50 comma-separated uuid:role pairs')
    return `(VALUES ${ms.map(([id, role]) => `('${id.toLowerCase()}'::uuid, '${role}')`).join(', ')})`
  },
  // search text: hex of the UTF-8 text, decoded by Postgres. SQL matches it with strpos(lower(col), lower(:q)) > 0,
  // a plain substring test with no LIKE wildcards to escape. (Escaping with replace() is out: Tabularis's read-only
  // mode flags "replace(" in larger queries as a write.)
  q: v => {
    if (!/^(?:[0-9a-f]{2}){0,200}$/.test(v)) throw new Error('must be hex-encoded text (max 200 bytes)')
    return `convert_from(decode('${v}', 'hex'), 'UTF8')`
  },
}
PARAMS.ids = v => { // sync_request ids to delete: 1-100 comma-separated UUIDs
  const ids = v.split(',')
  if (ids.length > 100 || !ids.every(id => UUID.test(id))) throw new Error('must be 1-100 comma-separated UUIDs')
  return ids.map(id => `'${id.toLowerCase()}'`).join(', ')
}

// Tabularis connections by environment (ids from Tabularis's connections.json: REFIT_ PROD, REFIT_STAG). Commands
// pass {env}; the drawer picks it from the page's hostname, so a page can only ever choose between these two.
export const CONNECTIONS = { prod: 'ea7632d2-f563-4d45-80ba-22728c416a40', stag: '93cae3df-54d8-4672-8092-aa27c3d49f0d' }

// The only writes tabularis-query.mjs will send, by SQL file, each with the exact shape its statement must have.
// Everything else must be a single SELECT / WITH. Tabularis still asks for approval in its console before a write.
const U = "'[0-9a-f-]{36}'"
const ROLE = "'(?:admin|editor|viewer)'"
// Exact statement for create-project.sql (whitespace collapsed), with each placeholder standing for the only forms
// its binder can emit. Kept here, apart from the .sql file, so editing the file can't widen what's allowed.
const CREATE_PROJECT = "WITH p AS ( INSERT INTO project (name, create_by, status, plan, end_date) VALUES (:name, :user_id, :project_status, :plan, :end_date) RETURNING id ), m AS ( INSERT INTO refit_user_project_relation (user_id, project_id, role) SELECT x.user_id, p.id, x.role FROM p, (SELECT :user_id::uuid AS user_id, 'admin'::text AS role UNION ALL SELECT * FROM :members AS v(user_id, role)) x ON CONFLICT (project_id, user_id) DO NOTHING RETURNING user_id ), t AS ( UPDATE refit_user SET had_trial = true WHERE id = :user_id AND :plan = 'TRIAL' RETURNING id ) SELECT p.id, (SELECT count(*) FROM m) AS members FROM p"
const SHAPES = {
  name: "convert_from\\(decode\\('(?:[0-9a-f]{2})+', 'hex'\\), 'UTF8'\\)",
  user_id: U,
  project_status: "'(?:ACTIVE|PAUSED|NEED_PAYMENT)'",
  plan: "'(?:BASIC|DEMO|ENTERPRISE|TRIAL)'",
  end_date: "'\\d{4}-\\d{2}-\\d{2}'::date",
  members: `(?:\\(VALUES \\(${U}::uuid, ${ROLE}\\)(?:, \\(${U}::uuid, ${ROLE}\\))*\\)|\\(SELECT NULL::uuid, NULL::text WHERE false\\))`,
}
const shape = sql => new RegExp('^' + sql.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/(?<![:\w]):(\w+)\b/g, (m, k) => SHAPES[k] ?? m) + '$', 'i')
export const WRITES = {
  'sql/create-project.sql': shape(CREATE_PROJECT),
  'sql/delete-syncs.sql': new RegExp(`^delete from sync_request where status = 'FAIL' and id in \\(${U}(?:, ${U})*\\) returning id$`, 'i'),
  'sql/add-project-user.sql': new RegExp(`^insert into refit_user_project_relation \\(user_id, project_id, role\\) values \\(${U}, ${U}, '(?:admin|editor|viewer)'\\) on conflict \\(project_id, user_id\\) do nothing returning user_id, role$`, 'i'),
}

// Throws unless `query` (already bound) is allowed for `sqlFile`. Returns true for an approved write.
export function checkQuery(sqlFile, query) {
  const q = query.trim().replace(/\s+/g, ' ')
  if (/;\s*\S/.test(q)) throw new Error('only a single statement is allowed')
  if (Object.hasOwn(WRITES, sqlFile)) {
    if (!WRITES[sqlFile].test(q.replace(/;$/, ''))) throw new Error(`${sqlFile} must be exactly its approved DELETE`)
    return true
  }
  if (!/^(select|with)\b/i.test(q)) throw new Error('only a single SELECT is allowed')
  // A WITH can carry a write (WITH x AS (INSERT …) SELECT …), so a read must not contain any write keyword.
  // Whole words only: columns like update_at / create_at are fine. Search text arrives as hex, so it can't trip this.
  if (/\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|copy)\b/i.test(q)) throw new Error('only a single SELECT is allowed (found a write keyword)')
  return false
}
const PLACEHOLDER = new RegExp(`(?<![:\\w]):(${Object.keys(PARAMS).join('|')})\\b`, 'g')

// Every placeholder the SQL uses needs a valid value, and every value given must be used by the SQL.
export function bindParams(sql, values = {}) {
  const used = new Set([...sql.matchAll(PLACEHOLDER)].map(m => m[1]))
  for (const k of Object.keys(values)) if (!used.has(k)) throw new Error(`This query takes no ${k}`)
  const out = {}
  for (const k of used) {
    if (typeof values[k] !== 'string') throw new Error(`Missing ${k}`)
    try { out[k] = PARAMS[k](values[k]) } catch (e) { throw new Error(`${k} ${e.message}`) }
  }
  return sql.replace(PLACEHOLDER, (_, k) => out[k])
}

// Hex of UTF-8 text, the form the q param expects (the extension does the same in src/projects.ts).
export const toHex = s => Buffer.from(s, 'utf8').toString('hex')

// Drops leading "--" comment lines, so the read-only check sees the first real keyword.
export const stripLeadingComments = sql => sql.replace(/^(?:\s*--[^\n]*\n)*/, '').trim()

// Builds argv from an allowlisted command spec. Params must be declared and match their pattern in full.
// A placeholder is a whole arg ("{name}"), never spliced into a string, and there is no shell anywhere.
export function buildArgv(spec, args) {
  const params = spec.params ?? {}
  if (args === null || typeof args !== 'object' || Array.isArray(args)) throw new Error('args must be an object')
  for (const k of Object.keys(args)) if (!Object.hasOwn(params, k)) throw new Error(`Unknown param: ${k}`)
  const values = {}
  for (const [k, p] of Object.entries(params)) {
    const v = Object.hasOwn(args, k) ? args[k] : p.default
    if (typeof v !== 'string') throw new Error(`Missing param: ${k}`)
    if (!new RegExp(`^(?:${p.pattern})$`).test(v)) throw new Error(`Invalid ${k}: ${JSON.stringify(v).slice(0, 60)}`)
    values[k] = v
  }
  return spec.args.map(a => {
    const m = /^\{(\w+)\}$/.exec(a)
    return m && Object.hasOwn(values, m[1]) ? values[m[1]] : a
  })
}
