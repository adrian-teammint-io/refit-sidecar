import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseFailedSyncs, connectionUrl, platform, dateRange, liveFails } from './failed-syncs.ts'

// Captured from a real `failed-syncs` run against prod (2026-10-01); recovered_* (added later) set to NULL by hand.
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
  recoveredStart: null,
  recoveredEnd: null,
  recoveredAt: null,
})
assert.equal(connectionUrl(rows[0]), 'https://app.refit.ai/799a63f3-235c-46ce-9141-12e28915539f/datasources/service/beae0810-e8a6-45ce-8790-cfa8974be78e')
assert.equal(platform(rows[0]), 'META')
assert.equal(dateRange(rows[0]), '2026-08-31 → 2026-09-30')

// column order is looked up by name; FILE connections have no service; truncation is reported
const cols = ['update_at', 'id', 'connection_id', 'project_id', 'project', 'name', 'kind', 'service', 'type', 'start_date', 'end_date', 'reason', 'display_reason', 'recovered_start', 'recovered_end', 'recovered_at', 'extra']
const fileRow = ['2026-09-01T00:00:00Z', 'a', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'P', 'sheet.csv', 'FILE', null, 'DAILY', '2026-09-01', '2026-09-01', null, 'Upload failed', '2026-08-25', '2026-09-02', '2026-09-03T01:00:00Z', 1]
const file = parseFailedSyncs(JSON.stringify({ columns: cols, rows: [fileRow], truncated: false, pagination: { has_more: true } }))
assert.equal(file.truncated, true)
assert.equal(platform(file.rows[0]), 'FILE')
assert.equal(dateRange(file.rows[0]), '2026-09-01')
assert.match(connectionUrl(file.rows[0])!, /\/datasources\/file\/1111/)
assert.deepEqual([file.rows[0].recoveredStart, file.rows[0].recoveredEnd, file.rows[0].recoveredAt], ['2026-08-25', '2026-09-02', '2026-09-03T01:00:00Z'])
assert.equal(parseFailedSyncs(JSON.stringify({ columns: cols, rows: [] })).rows.length, 0)

// Captured from a real run with no FAIL rows (2026-10-01): Tabularis drops the column list when nothing matched.
const empty = readFileSync(new URL('./samples/failed-syncs.empty.stdout.txt', import.meta.url), 'utf8')
assert.deepEqual(parseFailedSyncs(empty), { rows: [], truncated: false })

// a URL is only built from UUID-shaped ids
assert.equal(connectionUrl({ ...rows[0], projectId: '../../evil' }), undefined)
assert.equal(connectionUrl({ ...rows[0], kind: 'OTHER' }), undefined)

// liveFails: the newer FAIL list wins; otherwise the page, reason only while the newest sync is FAIL
const card = { connectionId: rows[0].connectionId, failed: 2, status: 'SUCCESS', reason: 'old error', displayReason: null }
const list = (at: number, rs = rows, truncated = false) => ({ at, runId: 'r', rows: rs, truncated })
assert.deepEqual(liveFails(card, 100), { failed: 2, reason: null }) // resolved: the leftover reason is hidden
assert.deepEqual(liveFails({ ...card, status: 'FAIL' }, 100), { failed: 2, reason: 'old error' })
assert.deepEqual(liveFails(card, 100, list(200)), { failed: 1, reason: rows[0].reason }) // newer list: its rows
assert.deepEqual(liveFails(card, 100, list(200, [{ ...rows[0], recoveredAt: '2026-10-02T00:00:00Z' }])), { failed: 1, reason: null }) // recovered: counted, no reason
assert.deepEqual(liveFails({ ...card, status: 'FAIL' }, 100, list(200, [])), { failed: 0, reason: null }) // deleted / gone from FAIL
assert.deepEqual(liveFails({ ...card, status: 'FAIL' }, 300, list(200, [])), { failed: 2, reason: 'old error' }) // older list: page wins
assert.deepEqual(liveFails({ ...card, status: 'FAIL' }, 100, list(200, [], true)), { failed: 2, reason: 'old error' }) // truncated: can't tell
assert.deepEqual(liveFails({ ...card, status: 'FAIL' }, 100, { ...list(200, []), error: 'x' }), { failed: 2, reason: 'old error' }) // failed fetch

assert.throws(() => parseFailedSyncs('$ tabularis --mcp'), /not JSON/)
assert.throws(() => parseFailedSyncs('{"columns":["id"],"rows":[["x"]]}'), /Missing column: connection_id/)
assert.throws(() => parseFailedSyncs(JSON.stringify({ columns: cols, rows: [[...fileRow.slice(0, 1), null, ...fileRow.slice(2)]] })), /id is null/)
assert.throws(() => parseFailedSyncs(JSON.stringify({ columns: cols, rows: ['x'] })), /not an array/)
console.log('failed-syncs ok')
