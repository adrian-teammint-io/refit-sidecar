import assert from 'node:assert/strict'
import { actionFor, keysOf, keyLabel, rebind, validKey } from './keybinds.ts'

const keys = keysOf()
assert.deepEqual(keys, { refetch: 'r' })
assert.deepEqual(keysOf({ refetch: 'F' }), { refetch: 'f' }) // stored overrides are lowercased
assert.deepEqual(keysOf({ refetch: 'Escape' }), { refetch: 'r' }) // invalid override falls back to the default

const field = { closest: (s: string) => (s.includes('input') ? {} : null) }
const page = { closest: () => null }
const ev = (key: string, more: object = {}) => ({ key, metaKey: false, ctrlKey: false, altKey: false, target: page, ...more }) as Parameters<typeof actionFor>[0]
assert.equal(actionFor(ev('r'), keys), 'refetch')
assert.equal(actionFor(ev('R'), keys), 'refetch') // Shift / caps lock still counts
assert.equal(actionFor(ev('r', { metaKey: true }), keys), undefined) // Cmd+R stays the browser's reload
assert.equal(actionFor(ev('r', { ctrlKey: true }), keys), undefined)
assert.equal(actionFor(ev('r', { target: field }), keys), undefined) // typing in a field
assert.equal(actionFor(ev('x'), keys), undefined)
assert.equal(actionFor(ev('Escape'), keys), undefined)
assert.equal(actionFor(ev('f'), keysOf({ refetch: 'f' })), 'refetch')

assert.deepEqual(rebind(keys, 'refetch', 'G'), { keys: { refetch: 'g' } })
assert.deepEqual(rebind(keys, 'refetch', 'Enter'), { error: 'Use a single letter or digit' })
assert.equal(validKey(' '), false)
assert.equal(keyLabel('r'), 'R')
// a key taken by another action is refused (simulated second action)
assert.match((rebind({ refetch: 'r', other: 'g' } as never, 'refetch', 'g') as { error: string }).error ?? '', /already/)
console.log('keybinds ok')
