import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseFailedSyncs, connectionUrl, platform, dateRange } from './failed-syncs.ts'

// Captured from a real `failed-syncs` run against prod (2026-10-01).
const sample = readFileSync(new URL('./samples/failed-syncs.stdout.txt', import.meta.url), 'utf8')
const { rows, truncated } = parseFailedSyncs(sample)
assert.equal(truncated, false)
assert.equal(rows.length, 1)
assert.deepEqual(rows[0], {
  id: '025c7f0d-c507-4deb-b7dc-52598a35d0d1',
  connectionId: 'beae0810-e8a6-45ce-8790-cfa8974be78e',
  projectId: '799a63f3-235c-46ce-9141-12e28915539f',
  project: '팀민트_크레이버',
  name: 'TEST',
  kind: 'SERVICE',
  service: 'META',
  type: 'FIRST',
  start: '2026-08-31',
  end: '2026-09-30',
  reason: "JSONDecodeError('Extra data: line 1 column 68008 (char 68007)')",
  displayReason: null,
  updatedAt: '2026-10-01T06:36:26Z',
})
assert.equal(connectionUrl(rows[0]), 'https://app.refit.ai/799a63f3-235c-46ce-9141-12e28915539f/datasources/service/beae0810-e8a6-45ce-8790-cfa8974be78e')
assert.equal(platform(rows[0]), 'META')
assert.equal(dateRange(rows[0]), '2026-08-31 → 2026-09-30')

// column order is looked up by name; FILE connections have no service; truncation is reported
const cols = ['update_at', 'id', 'connection_id', 'project_id', 'project', 'name', 'kind', 'service', 'type', 'start_date', 'end_date', 'reason', 'display_reason', 'extra']
const fileRow = ['2026-09-01T00:00:00Z', 'a', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'P', 'sheet.csv', 'FILE', null, 'DAILY', '2026-09-01', '2026-09-01', null, 'Upload failed', 1]
const file = parseFailedSyncs(JSON.stringify({ columns: cols, rows: [fileRow], truncated: false, pagination: { has_more: true } }))
assert.equal(file.truncated, true)
assert.equal(platform(file.rows[0]), 'FILE')
assert.equal(dateRange(file.rows[0]), '2026-09-01')
assert.match(connectionUrl(file.rows[0])!, /\/datasources\/file\/1111/)
assert.equal(parseFailedSyncs(JSON.stringify({ columns: cols, rows: [] })).rows.length, 0)

// a URL is only built from UUID-shaped ids
assert.equal(connectionUrl({ ...rows[0], projectId: '../../evil' }), undefined)
assert.equal(connectionUrl({ ...rows[0], kind: 'OTHER' }), undefined)

assert.throws(() => parseFailedSyncs('$ tabularis --mcp'), /not JSON/)
assert.throws(() => parseFailedSyncs('{"columns":["id"],"rows":[]}'), /Missing column: connection_id/)
assert.throws(() => parseFailedSyncs(JSON.stringify({ columns: cols, rows: [[...fileRow.slice(0, 1), null, ...fileRow.slice(2)]] })), /id is null/)
assert.throws(() => parseFailedSyncs(JSON.stringify({ columns: cols, rows: ['x'] })), /not an array/)
console.log('failed-syncs ok')
