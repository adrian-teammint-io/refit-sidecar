// groups.mjs against a temp vault: the note format, every edit op, and the CLI the server runs.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'refit-groups-'))
process.env.REFIT_SIDECAR_GROUPS = root
const { parseGroup, listGroups, editGroups, fileOf, MAX_GROUP } = await import('./groups.mjs')
const A = '63f012fe-ec29-4f08-a649-d9067b55b1ac', B = '10309e57-d9e7-476b-836b-b25125eced9d', C = '014cdeee-3990-43b6-9d87-68d13e24c54c'

// parse: heading wins over the file name; UUID bullets in any case, labels after a separator; other lines ignored
const p = parseGroup(`---\nenv: production\n---\n# Craver Meta\n\nnotes here\n- ${A.toUpperCase()} · META · TEST\n* ${B}\n- ${A}\n- not-an-id\n`, 'x.md')
assert.deepEqual(p, { name: 'Craver Meta', file: 'x.md', conns: [{ id: A, label: 'META · TEST' }, { id: B, label: '' }] })
assert.equal(parseGroup(`- ${C}`, 'JP Google.md').name, 'JP Google')
assert.equal(fileOf('../a/b:c'), '-a-b-c.md')
assert.equal(fileOf('  '), 'group.md')

// add creates the file (and folder), same name in any case adds to it, labels refresh, dupes merge
let gs = editGroups('prod', { op: 'add', name: 'Craver Meta', conns: [{ id: A, label: 'META · TEST\nevil' }] }, 'T1')
assert.deepEqual(gs.map(g => [g.name, g.file, g.conns.length]), [['Craver Meta', 'Craver Meta.md', 1]])
assert.equal(gs[0].conns[0].label, 'META · TEST evil') // newline can't break the list
gs = editGroups('prod', { op: 'add', name: 'craver meta', conns: [{ id: A }, { id: B, label: 'B' }] }, 'T2')
assert.deepEqual(gs[0].conns.map(c => [c.id, c.label]), [[A, 'META · TEST evil'], [B, 'B']])
assert.match(readFileSync(join(root, 'production', 'Craver Meta.md'), 'utf8'), /^---\nrefit-sidecar: connection-group\nenv: production\nupdated: T2\n---\n# Craver Meta\n\n- 63f0/)
assert.deepEqual(listGroups('stag'), []) // environments are separate folders
assert.throws(() => editGroups('prod', { op: 'add', name: 'X', conns: [{ id: "x' OR 1" }] }), /UUID/)
assert.throws(() => editGroups('prod', { op: 'add', name: ' ', conns: [{ id: A }] }), /name/)
const many = Array.from({ length: MAX_GROUP }, (_, i) => ({ id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}` }))
assert.throws(() => editGroups('prod', { op: 'add', name: 'Craver Meta', conns: many }), /at most/)

// create: an empty group (its note has the heading and no members); refused for a taken name
gs = editGroups('prod', { op: 'create', name: 'Empty one' })
assert.deepEqual(gs.find(g => g.name === 'Empty one'), { name: 'Empty one', file: 'Empty one.md', conns: [] })
assert.throws(() => editGroups('prod', { op: 'create', name: 'empty ONE' }), /another group/)
editGroups('prod', { op: 'delete', name: 'Empty one' })

// a file an agent wrote by hand is picked up and edited in place
mkdirSync(join(root, 'production'), { recursive: true })
writeFileSync(join(root, 'production', 'jp.md'), `# JP Google\n- ${C} · GOOGLE_ADS · Google_US\n`)
gs = editGroups('prod', { op: 'remove', name: 'Craver Meta', ids: [A.toUpperCase()] })
assert.deepEqual(gs.map(g => [g.name, g.conns.length]), [['Craver Meta', 1], ['JP Google', 1]])

// rename moves the file, refuses another group's name; delete removes it
assert.throws(() => editGroups('prod', { op: 'rename', name: 'JP Google', to: 'CRAVER META' }), /another group/)
gs = editGroups('prod', { op: 'rename', name: 'JP Google', to: 'JP Ads' })
assert.deepEqual(readdirSync(join(root, 'production')).sort(), ['Craver Meta.md', 'JP Ads.md'])
assert.equal(gs.find(g => g.name === 'JP Ads').conns[0].id, C)
gs = editGroups('prod', { op: 'delete', name: 'jp ads' })
assert.deepEqual(readdirSync(join(root, 'production')), ['Craver Meta.md'])
assert.throws(() => editGroups('prod', { op: 'delete', name: 'nope' }), /no group/)

// CLI as the server runs it (relative path, cwd host/): JSON on stdout, exit 2 with the reason on a bad op
const cli = (...a) => execFileSync(process.execPath, ['groups.mjs', ...a], { cwd: import.meta.dirname, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] }).toString()
assert.equal(JSON.parse(cli('prod', 'list')).groups[0].name, 'Craver Meta')
const hex = o => Buffer.from(JSON.stringify(o)).toString('hex')
assert.equal(JSON.parse(cli('stag', 'edit', hex({ op: 'add', name: 'S', conns: [{ id: A }] }))).groups[0].file, 'S.md')
assert.throws(() => cli('prod', 'edit', hex({ op: 'delete', name: 'nope' })), e => e.status === 2 && /no group/.test(e.stderr.toString()))
assert.throws(() => cli('dev', 'list'), e => e.status === 2)
console.log('groups host ok')
