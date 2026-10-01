import assert from 'node:assert/strict'
import { splitChunk, flushCarry, pushLines, stripAnsi, duration, ago, runStatus, MAX_LINE_CHARS, type Line } from './term.ts'

assert.equal(stripAnsi('\x1b[1;31mred\x1b[0m \x1b]8;;http://x\x07link\x1b]8;;\x07 \x1b[2K\x1b[1Gdone'), 'red link done')

let r = splitChunk('', 'a\nb')
assert.deepEqual(r, { lines: ['a'], carry: 'b' })
r = splitChunk(r.carry, 'c\r\n\x1b[32mok\x1b[0m\n')
assert.deepEqual(r, { lines: ['bc', 'ok'], carry: '' })
assert.deepEqual(splitChunk('', '10%\r50%\r100%\n').lines, ['100%']) // progress redraws keep the last frame
assert.deepEqual(flushCarry('tail'), ['tail'])
assert.deepEqual(flushCarry(''), [])
assert.equal(splitChunk('', 'x'.repeat(MAX_LINE_CHARS + 5) + '\n').lines[0].length, MAX_LINE_CHARS + 2)

const buf: Line[] = []
assert.equal(pushLines(buf, [{ s: 'out', t: '1' }, { s: 'out', t: '2' }], 3), 0)
assert.equal(pushLines(buf, [{ s: 'err', t: '3' }, { s: 'out', t: '4' }], 3), 1)
assert.deepEqual(buf.map(l => l.t), ['2', '3', '4'])

assert.equal(duration(840), '840ms')
assert.equal(duration(1033), '1.0s')
assert.equal(duration(65_000), '1m 05s')
assert.equal(ago(0, 30_000), 'just now')
assert.equal(ago(0, 5 * 60_000), '5m ago')
assert.equal(ago(0, 3 * 3600_000), '3h ago')
assert.equal(ago(0, 72 * 3600_000), '3d ago')

assert.deepEqual(runStatus({ startedAt: 0 }, 3200), { tone: 'run', label: 'running · 3.2s' })
assert.deepEqual(runStatus({ startedAt: 0, endedAt: 1033, exit: 0 }, 9e9), { tone: 'ok', label: 'exit 0 · 1.0s' })
assert.deepEqual(runStatus({ startedAt: 0, endedAt: 500, exit: 1 }, 9e9), { tone: 'fail', label: 'exit 1 · 500ms' })
assert.deepEqual(runStatus({ startedAt: 0, endedAt: 4100, exit: 143, signal: 'SIGTERM' }, 9e9), { tone: 'fail', label: 'cancelled · 4.1s' })
assert.deepEqual(runStatus({ startedAt: 0, endedAt: 1, error: 'Host stopped' }, 9e9), { tone: 'fail', label: 'Host stopped' })
console.log('term ok')
