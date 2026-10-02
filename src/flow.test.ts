// node --experimental-strip-types src/flow.test.ts
import assert from 'node:assert/strict'
import { layers, layout, matchesNode, parseFlow, steps } from './flow.ts'

const C = (id: string) => ({ type: 'connection', id, name: `conn ${id}` })
const T = (id: string) => ({ type: 'transaction', id, name: id })
const row = (id: string, type: string, inputs: object[], outputs = 0, status: string | null = null) =>
  [id, id, type, JSON.stringify(inputs), outputs, status, status && '2026-10-01T00:00:00Z']
// Diamond: a, b load connections; j joins them; x exports j and also reads a directly. Plus a dangling input and a cycle.
const stdout = JSON.stringify({
  columns: ['id', 'name', 'type', 'inputs', 'outputs', 'output_status', 'output_at'],
  rows: [
    row('x', 'export', [T('j'), T('a')], 1, 'FAIL'),
    row('j', 'join', [T('b'), T('a')]),
    row('a', 'organize', [C('c1')]),
    row('b', 'organize', [C('c2'), T('deleted')]),
    row('p', 'union', [T('q')]),
    row('q', 'organize', [T('p')]),
  ],
  truncated: false,
})

const { rows, truncated } = parseFlow(stdout)
assert.equal(truncated, false)
assert.deepEqual(rows[0].inputs, [T('j'), T('a')])
assert.equal(rows[0].outputs, 1)
assert.equal(rows[0].outputStatus, 'FAIL')
assert.equal(rows[2].outputStatus, null)

const st = steps(rows)
assert.deepEqual(Object.fromEntries(st), { a: 1, b: 1, j: 2, x: 3, p: 2, q: 1 }) // dangling 'deleted' ignored; cycle cut at its first visit

const ls = layers(rows).map(l => l.map(n => n.id))
assert.deepEqual(ls, [['a', 'b', 'q'], ['j', 'p'], ['x']]) // p reads q (row 2) so sorts after j (rows 0, 1)

const g = layout(rows)
assert.equal(g.edges.length, 5) // x<-j, x<-a, j<-b, j<-a, p<-q; not 'deleted', and not q<-p (closes the cycle)
assert.equal(g.placed.get('x')!.x > g.placed.get('j')!.x, true)
assert.equal(g.height, 3 * 46 + 2 * 14)

assert.deepEqual(rows.filter(r => matchesNode(r, ' JOIN ')).map(r => r.id), ['j']) // type, trimmed, any case
assert.deepEqual(rows.filter(r => matchesNode(r, 'conn c2')).map(r => r.id), ['b']) // an input's name
assert.equal(rows.filter(r => matchesNode(r, '')).length, rows.length)
assert.deepEqual(layout([]).edges, [])
assert.throws(() => parseFlow(JSON.stringify({ columns: ['id', 'name', 'type', 'inputs', 'outputs', 'output_status', 'output_at'], rows: [['a', 'a', 'organize', '{}', 0, null, null]] })), /not a list/)
console.log('flow ok')
