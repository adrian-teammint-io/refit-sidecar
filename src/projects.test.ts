import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  parseProjects, parseMembers, parseProjectConnections, parseConnections, parseFittingRooms, toHex, fromHex, cleanQuery, toArgs, queryOf,
  mergePage, cacheProject, togglePin, refreshPins, pinnedFor, dropStalePages, BATCH, MAX_CACHED_PROJECTS, type Project, type ProjectsQuery,
} from './projects.ts'
import { connectionUrl, projectUrl, fittingRoomUrl } from './failed-syncs.ts'

const sample = (f: string) => readFileSync(new URL(`./samples/${f}`, import.meta.url), 'utf8')

// Captured from real runs against prod (2026-10-01), trimmed.
const projects = parseProjects(sample('projects.stdout.txt'))
assert.equal(projects.length, 5)
assert.deepEqual(projects[1], { id: 'af486ea5-cfba-479f-8b68-b3cabf51e611', name: '(테스트)E2E 프로젝트 TRIAL', status: 'ACTIVE', plan: 'TRIAL', connections: 0, failed: 0, lastSync: null })

// project-members: owner (0/1, the project's create_by) reads as a boolean
const members = parseMembers(JSON.stringify({
  columns: ['id', 'email', 'name', 'role', 'added_at', 'owner'],
  rows: [['u1', 'a@x.io', 'A', 'admin', '2026-01-01T00:00:00Z', 1], ['u2', 'b@x.io', null, 'viewer', '2026-01-02T00:00:00Z', 0]],
}))
assert.deepEqual(members.map(m => [m.id, m.owner, m.name]), [['u1', true, 'A'], ['u2', false, null]])

const conns = parseProjectConnections(sample('project-connections.stdout.txt'))
assert.equal(conns.length, 5)
const file = conns.find(c => c.kind === 'FILE')!
assert.equal(file.service, null)
assert.equal(conns.find(c => c.status === 'FRAGMENTED')!.syncType, 'SCHEDULED')
assert.ok(conns.every(c => c.reason === null || c.reason.length > 0)) // "" reads as null
assert.match(connectionUrl(file)!, /^https:\/\/app\.refit\.ai\/799a63f3-[\w-]+\/datasources\/file\/[\w-]+$/)

const hits = parseConnections(sample('connections.stdout.txt'))
assert.equal(hits.length, 4)
assert.ok(hits.every(h => h.project.length > 0 && typeof h.failed === 'number'))
assert.ok(connectionUrl(hits[0]))

const rooms = parseFittingRooms(sample('fitting-rooms.stdout.txt'))
assert.equal(rooms.length, 4)
assert.ok(rooms.every(r => r.nodes >= 0 && r.outputs >= 0 && r.updatedAt.endsWith('Z')))
assert.equal(fittingRoomUrl(rooms[0]), `https://app.refit.ai/${rooms[0].projectId}/fitting/${rooms[0].id}`)
assert.equal(fittingRoomUrl({ ...rooms[0], id: '../x' }), undefined)
assert.equal(projectUrl('javascript:alert(1)'), undefined)
assert.deepEqual(parseFittingRooms('{"columns":[],"rows":[]}'), [])

// search text travels as hex, round-trips any text, and is capped without splitting a character
assert.equal(toHex('ab'), '6162')
for (const s of ["it's 50%_; DROP --", '팀민트_크레이버', '']) assert.equal(fromHex(toHex(s)), s)
assert.match(toHex('팀민트'), /^[0-9a-f]+$/)
assert.equal(new TextEncoder().encode(cleanQuery('가'.repeat(100))).length, 198) // 66 x 3 bytes
assert.equal(cleanQuery('  skin  '), 'skin')
const q: ProjectsQuery = { q: ' 크레이버 ', status: 'ACTIVE', sort: 'active' }
const args = toArgs(q, 30)
assert.deepEqual(args, { q: toHex('크레이버'), status: 'ACTIVE', sort: 'active', offset: '30' })
assert.deepEqual(queryOf<ProjectsQuery>(args, ['q', 'status', 'sort']), { q: '크레이버', status: 'ACTIVE', sort: 'active' })
assert.deepEqual(toArgs({ q: 'x', sort: 'service' }, 0, { project: 'p1' }), { project: 'p1', q: '78', sort: 'service', offset: '0' })

// batches: BATCH + 1 rows means "more"; same query at the next offset appends, anything else replaces
const P = (i: number, extra: Partial<Project> = {}): Project => ({ id: `p${i}`, name: `P${i}`, status: 'ACTIVE', plan: null, connections: 0, failed: 0, lastSync: null, ...extra })
const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => P(a + i))
const id = (p: Project) => p.id
const query = { q: '', status: 'all', sort: 'active' }
let page = mergePage(undefined, query, 0, range(0, BATCH + 1), 1, 'r1', id)
assert.equal(page.rows.length, BATCH)
assert.equal(page.hasMore, true)
page = mergePage(page, query, BATCH, range(BATCH, BATCH + 5), 2, 'r2', id)
assert.equal(page.rows.length, BATCH + 5)
assert.equal(page.hasMore, false)
assert.equal(page.rows.at(-1)!.id, `p${BATCH + 4}`)
const dup = mergePage(mergePage(undefined, query, 0, range(0, BATCH + 1), 1, 'a', id), query, BATCH, [P(BATCH - 1), ...range(BATCH, BATCH + 3)], 2, 'b', id)
assert.equal(new Set(dup.rows.map(id)).size, dup.rows.length) // a row that shifted between batches isn't shown twice
const other = mergePage(page, { ...query, q: 'x' }, BATCH, range(0, 2), 3, 'r3', id) // different query: replace
assert.equal(other.rows.length, 2)
const stale = mergePage(page, query, 10, range(10, 12), 4, 'r4', id) // offset doesn't line up: replace
assert.equal(stale.rows.length, 2)

// pages stored by the pre-batching version (no query) are dropped; current pages and other keys pass through
const legacy = { at: 1, runId: 'old', rows: [P(1)] }
const cur = mergePage(undefined, query, 0, range(0, 2), 1, 'a', id)
const cleaned = dropStalePages({ projects: legacy, connections: cur, failedSyncs: legacy, projectConnections: { a: legacy, b: cur } })
assert.equal(cleaned.projects, undefined)
assert.equal(cleaned.connections, cur)
assert.equal(cleaned.failedSyncs, legacy)
assert.deepEqual(Object.keys(cleaned.projectConnections), ['b'])
assert.deepEqual(dropStalePages({ run: 1 }), { run: 1 })

// cache keeps the newest MAX_CACHED_PROJECTS
let cache: Record<string, { at: number }> = {}
for (let i = 0; i < MAX_CACHED_PROJECTS + 3; i++) cache = cacheProject(cache, `p${i}`, { at: i })
assert.equal(Object.keys(cache).length, MAX_CACHED_PROJECTS)
assert.ok(!('p0' in cache) && 'p3' in cache)

// pins: toggle, refresh snapshots, list active first and filtered by search/status
let pins = togglePin({}, P(1, { name: 'Zeta', status: 'PAUSED' }), 5)
pins = togglePin(pins, P(2, { name: 'Alpha' }), 6)
pins = togglePin(pins, P(3, { name: 'Beta' }), 7)
assert.deepEqual(pinnedFor(pins, '', 'all').map(p => p.name), ['Alpha', 'Beta', 'Zeta'])
assert.deepEqual(pinnedFor(pins, 'ze', 'all').map(p => p.name), ['Zeta'])
assert.deepEqual(pinnedFor(pins, '', 'ACTIVE').map(p => p.name), ['Alpha', 'Beta'])
pins = togglePin(pins, P(3), 8)
assert.ok(!pins.p3)
const refreshed = refreshPins(pins, [P(2, { name: 'Alpha 2', failed: 4 }), P(9)])!
assert.equal(refreshed.p2.name, 'Alpha 2')
assert.equal(refreshed.p2.pinnedAt, 6)
assert.equal(refreshPins(refreshed, [P(2, { name: 'Alpha 2', failed: 4 })]), undefined) // nothing changed: no write
console.log('projects ok')
