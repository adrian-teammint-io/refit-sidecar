import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseProjects, parseProjectConnections, searchProjects, cacheProject, MAX_CACHED_PROJECTS, type Project } from './projects.ts'
import { connectionUrl, projectUrl } from './failed-syncs.ts'

const sample = (f: string) => readFileSync(new URL(`./samples/${f}`, import.meta.url), 'utf8')

// Captured from real runs against prod (2026-10-01), trimmed.
const projects = parseProjects(sample('projects.stdout.txt'))
assert.equal(projects.length, 5)
assert.deepEqual(projects[1], { id: 'af486ea5-cfba-479f-8b68-b3cabf51e611', name: '(테스트)E2E 프로젝트 TRIAL', status: 'ACTIVE', plan: 'TRIAL', connections: 0, failed: 0, lastSync: null })
assert.ok(projects.every(p => typeof p.connections === 'number' && typeof p.failed === 'number'))

const conns = parseProjectConnections(sample('project-connections.stdout.txt'))
assert.equal(conns.length, 5)
const file = conns.find(c => c.kind === 'FILE')!
assert.equal(file.service, null)
assert.equal(conns.find(c => c.status === 'FRAGMENTED')!.syncType, 'SCHEDULED')
assert.ok(conns.every(c => c.projectId === '799a63f3-235c-46ce-9141-12e28915539f'))
assert.ok(conns.every(c => c.reason === null || c.reason.length > 0)) // "" reads as null
assert.match(connectionUrl(file)!, /^https:\/\/app\.refit\.ai\/799a63f3-[\w-]+\/datasources\/file\/[\w-]+$/)
assert.equal(projectUrl('799a63f3-235c-46ce-9141-12e28915539f'), 'https://app.refit.ai/799a63f3-235c-46ce-9141-12e28915539f')
assert.equal(projectUrl('javascript:alert(1)'), undefined)

// empty project: Tabularis drops the column list
assert.deepEqual(parseProjectConnections('{"columns":[],"rows":[]}'), [])
assert.throws(() => parseProjects('{"columns":["id"],"rows":[["x"]]}'), /Missing column: name/)
assert.throws(() => parseProjects(JSON.stringify({ columns: ['id', 'name', 'status', 'plan', 'connections', 'failed', 'last_sync'], rows: [['a', 'b', 'ACTIVE', null, 'many', 0, null]] })), /not a number/)

// search: every word must match name, id or plan; status filter
const P = (name: string, status = 'ACTIVE', plan = 'BASIC', id = '00000000-0000-4000-8000-000000000000'): Project => ({ id, name, status, plan, connections: 1, failed: 0, lastSync: null })
const list = [P('SKIN1004 USA'), P('Sample Brand KR', 'PAUSED'), P('팀민트_크레이버', 'ACTIVE', 'TRIAL', '799a63f3-235c-46ce-9141-12e28915539f')]
assert.deepEqual(searchProjects(list, '').map(p => p.name), list.map(p => p.name))
assert.deepEqual(searchProjects(list, 'skin usa').map(p => p.name), ['SKIN1004 USA'])
assert.deepEqual(searchProjects(list, 'usa skin').map(p => p.name), ['SKIN1004 USA'])
assert.deepEqual(searchProjects(list, '크레이버').map(p => p.name), ['팀민트_크레이버'])
assert.deepEqual(searchProjects(list, '799A63').map(p => p.name), ['팀민트_크레이버'])
assert.deepEqual(searchProjects(list, 'trial').map(p => p.name), ['팀민트_크레이버'])
assert.deepEqual(searchProjects(list, '', 'PAUSED').map(p => p.name), ['Sample Brand KR'])
assert.deepEqual(searchProjects(list, 'skin', 'PAUSED'), [])

// cache keeps the newest MAX_CACHED_PROJECTS
let cache = {}
for (let i = 0; i < MAX_CACHED_PROJECTS + 3; i++) cache = cacheProject(cache, `p${i}`, { at: i, runId: 'r', rows: [] })
assert.equal(Object.keys(cache).length, MAX_CACHED_PROJECTS)
assert.ok(!('p0' in cache) && !('p2' in cache) && 'p3' in cache && `p${MAX_CACHED_PROJECTS + 2}` in cache)
console.log('projects ok')
