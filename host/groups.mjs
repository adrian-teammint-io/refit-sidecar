// Saved connection groups as Markdown notes in the Obsidian vault, one file per group:
//   ~/personal-projects/obsidian_notes/refit-sidecar/groups/{production,staging}/<group name>.md
// The drawer reads and edits them only through this script (groups-list / groups-edit in commands.json); agents and
// people may edit the files directly (the /refit-sidecar:add-group-connection command does). Format (FORMAT below):
// the group name is the first "# " heading (else the file name); every "- " line starting with a connection UUID is a
// member, anything after the UUID is a free label; other lines are ignored. An edit rewrites the whole file.
// Usage: node groups.mjs <prod|stag> list | edit <hex of JSON op>. Prints {groups: [{name, file, conns: [{id, label}]}]}.
// The env override is for host.test.mjs.
import { readdirSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { UUID } from './protocol.mjs'

export const ROOT = process.env.REFIT_SIDECAR_GROUPS ?? join(homedir(), 'personal-projects/obsidian_notes/refit-sidecar/groups')
const DIRS = { prod: 'production', stag: 'staging' }
export const MAX_GROUP = 100 // the connection-group ids param takes at most 100 (src/groups.ts)
const MAX_NAME = 100

const dirOf = env => join(ROOT, DIRS[env])
const norm = s => s.trim().toLowerCase()
// One line: no newlines or control characters, trimmed, capped.
const oneLine = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max)
// A file name from a group name: no path separators or characters Obsidian / macOS dislike, no leading dot.
export const fileOf = name => `${oneLine(name, MAX_NAME).replace(/[/\\:*?"<>|#^[\]]+/g, '-').replace(/^\.+/, '').trim() || 'group'}.md`

export function parseGroup(text, file) {
  const heading = /^# +(.+)$/m.exec(text.replace(/^---\n[\s\S]*?\n---\n/, ''))
  const conns = [], seen = new Set()
  for (const line of text.split('\n')) {
    const m = /^\s*[-*] +([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b(.*)$/i.exec(line)
    if (!m || seen.has(m[1].toLowerCase())) continue
    seen.add(m[1].toLowerCase())
    conns.push({ id: m[1].toLowerCase(), label: oneLine(m[2].replace(/^\s*[·|—–-]\s*/, ''), 200) })
  }
  return { name: oneLine(heading?.[1] ?? file.replace(/\.md$/, ''), MAX_NAME), file, conns }
}

export const FORMAT = (env, g, now) => [
  '---', 'refit-sidecar: connection-group', `env: ${DIRS[env]}`, `updated: ${now}`, '---',
  `# ${g.name}`, '',
  ...g.conns.map(c => `- ${c.id}${c.label ? ` · ${c.label}` : ''}`), '',
].join('\n')

export function listGroups(env) {
  const dir = dirOf(env)
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(f => f.endsWith('.md')).sort()
    .map(f => parseGroup(readFileSync(join(dir, f), 'utf8'), f))
}

// Applies one op to the files: create (an empty group), add (creates the group too), remove, rename, delete.
// Returns the new list.
export function editGroups(env, op, now = new Date().toISOString()) {
  const dir = dirOf(env)
  mkdirSync(dir, { recursive: true })
  const groups = listGroups(env)
  const name = oneLine(op?.name, MAX_NAME)
  if (!name) throw new Error('give the group a name')
  const g = groups.find(x => norm(x.name) === norm(name))
  const write = x => writeFileSync(join(dir, x.file), FORMAT(env, x, now))
  if (op.op === 'create') {
    if (g) throw new Error('another group has that name')
    const file = fileOf(name)
    if (existsSync(join(dir, file))) throw new Error(`${file} already exists with another group name`)
    write({ name, file, conns: [] })
  } else if (op.op === 'add') {
    if (!Array.isArray(op.conns) || !op.conns.length || !op.conns.every(c => UUID.test(c?.id ?? ''))) throw new Error('add takes 1+ connections with UUID ids')
    const next = g ?? { name, file: fileOf(name), conns: [] }
    if (!g && existsSync(join(dir, next.file))) throw new Error(`${next.file} already exists with another group name`)
    for (const c of op.conns) {
      const id = c.id.toLowerCase(), label = oneLine(c.label, 200)
      const had = next.conns.find(x => x.id === id)
      if (had) had.label = label || had.label
      else next.conns.push({ id, label })
    }
    if (next.conns.length > MAX_GROUP) throw new Error(`a group holds at most ${MAX_GROUP} connections`)
    write(next)
  } else if (!g) throw new Error(`no group named ${JSON.stringify(name)}`)
  else if (op.op === 'remove') {
    const ids = new Set((op.ids ?? []).map(i => String(i).toLowerCase()))
    write({ ...g, conns: g.conns.filter(c => !ids.has(c.id)) })
  } else if (op.op === 'rename') {
    const to = oneLine(op.to, MAX_NAME)
    if (!to) throw new Error('give the group a name')
    if (groups.some(x => x !== g && norm(x.name) === norm(to))) throw new Error('another group has that name')
    const file = fileOf(to)
    if (file !== g.file && existsSync(join(dir, file))) throw new Error(`${file} already exists`)
    write({ ...g, name: to, file })
    if (file !== g.file) unlinkSync(join(dir, g.file))
  } else if (op.op === 'delete') unlinkSync(join(dir, g.file))
  else throw new Error(`unknown op ${JSON.stringify(op.op)}`)
  return listGroups(env)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [env, cmd, body] = process.argv.slice(2)
  try {
    if (!Object.hasOwn(DIRS, env)) throw new Error('env must be prod or stag')
    const groups = cmd === 'list' ? listGroups(env)
      : cmd === 'edit' ? editGroups(env, JSON.parse(Buffer.from(body ?? '', 'hex').toString('utf8')))
      : (() => { throw new Error('usage: groups.mjs <prod|stag> list | edit <hex JSON>') })()
    process.stderr.write(`groups ${cmd} on ${env.toUpperCase()}: ${groups.length} in ${dirOf(env)}\n`)
    process.stdout.write(JSON.stringify({ groups }))
  } catch (e) {
    process.stderr.write(`groups: ${e.message}\n`)
    process.exit(2)
  }
}
