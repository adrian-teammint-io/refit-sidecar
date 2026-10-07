import assert from 'node:assert/strict'
import { fromFiles, refreshGroups, groupRows, groupLabel, groupKey, opSummary, type Groups } from './groups.ts'
import type { ConnectionHit } from './projects.ts'

const C = (id: string, name: string, service: string | null = 'META', status: string | null = 'SUCCESS'): ConnectionHit => ({
  connectionId: id, projectId: 'p', project: 'P', name, kind: service ? 'SERVICE' : 'FILE', service, start: null, end: null,
  status, syncType: null, lastSync: null, reason: null, displayReason: null, failed: 0,
})

// label round trip: what the drawer writes next to an id, and how a not-yet-checked id reads back
assert.equal(groupLabel(C('a', ' TEST ')), 'META · TEST · P')
assert.equal(groupLabel(C('f', 'Sheet', null)), 'FILE · Sheet · P')

// fromFiles: members from the notes, snapshots kept from any cached group, unknown ids as stubs from their label
const files = { groups: [
  { name: 'Craver Meta', file: 'Craver Meta.md', conns: [{ id: 'a', label: 'META · TEST · P' }, { id: 'c', label: 'TIKTOK · New · Q' }] },
  { name: 'JP', file: 'jp.md', conns: [{ id: 'f', label: 'FILE · Sheet · R' }, { id: 'x', label: '' }, { id: 'y', label: 'free text' }] },
] }
const prev: Groups = { old: { name: 'Old', file: 'old.md', at: 5, conns: { a: { ...C('a', 'TEST', 'META', 'FAIL') } } } }
let gs = fromFiles(files, prev)
assert.deepEqual(Object.keys(gs), ['craver meta', 'jp'])
assert.equal(gs['craver meta'].conns.a.status, 'FAIL') // snapshot from another group's cache
assert.equal(gs['craver meta'].conns.a.stub, undefined)
assert.deepEqual([gs['craver meta'].conns.c.stub, gs['craver meta'].conns.c.service, gs['craver meta'].conns.c.name, gs['craver meta'].conns.c.project], [true, 'TIKTOK', 'New', 'Q'])
assert.deepEqual([gs.jp.conns.f.kind, gs.jp.conns.f.service], ['FILE', null])
assert.equal(gs.jp.conns.x.name, 'x') // no label: the id
assert.equal(gs.jp.conns.y.name, 'free text')
assert.equal(groupKey('  Craver META '), 'craver meta')

// refresh: fresh rows replace snapshots and stubs, a missing asked id is gone, `at` only when all were asked
gs = refreshGroups(gs, ['a', 'c'], [C('a', 'TEST', 'META', 'SUCCESS')], 9)
assert.equal(gs['craver meta'].conns.a.status, 'SUCCESS')
assert.deepEqual([gs['craver meta'].conns.c.gone, gs['craver meta'].conns.c.stub], [true, undefined])
assert.equal(gs['craver meta'].at, 9)
assert.equal(gs.jp.at, undefined)
// a checked group keeps `at` through the next list unless the note brought new (stub) ids
assert.equal(fromFiles({ groups: [files.groups[0]] }, gs)['craver meta'].at, 9)
assert.equal(fromFiles({ groups: [{ ...files.groups[0], conns: [...files.groups[0].conns, { id: 'n', label: '' }] }] }, gs)['craver meta'].at, undefined)

// rows: by platform, then name
// rows: FAIL, IN_PROGRESS, FRAGMENTED, SUCCESS, then the rest (never synced, not found, not checked), each by name
const st = (id: string, name: string, status: string | null, extra = {}) => ({ ...C(id, name, 'META', status), ...extra })
const order = groupRows({ name: 'S', file: 's.md', conns: Object.fromEntries([
  st('1', 'b ok', 'SUCCESS'), st('2', 'a frag', 'FRAGMENTED'), st('3', 'z fail', 'FAIL'), st('4', 'a fail', 'FAIL'), st('5', 'run', 'IN_PROGRESS'),
  st('6', 'a never', null), st('7', 'gone', 'FAIL', { gone: true }), st('8', 'a ok', 'SUCCESS'),
].map(c => [c.connectionId, c])) })
assert.deepEqual(order.map(c => c.name), ['a fail', 'z fail', 'run', 'a frag', 'a ok', 'b ok', 'a never', 'gone'])

assert.equal(opSummary({ op: 'add', name: 'G', conns: [{ id: 'a', label: 'META · TEST · P' }] }), 'Added TEST to G')
assert.equal(opSummary({ op: 'add', name: 'G', conns: [{ id: 'a', label: '' }, { id: 'b', label: '' }] }), 'Added 2 connections to G')
assert.equal(opSummary({ op: 'remove', name: 'G', ids: ['a'] }), 'Removed 1 connection from G')
assert.equal(opSummary({ op: 'delete', name: 'G' }), 'Deleted group G')
assert.equal(opSummary({ op: 'create', name: 'G' }), 'Created group G')
console.log('groups ok')
