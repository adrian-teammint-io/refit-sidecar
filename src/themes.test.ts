import assert from 'node:assert/strict'
import { fontFamily, vars, DEFAULTS } from './themes.ts'

// A typed font name only ever becomes a quoted family name (generics stay bare); '' keeps the bundled font.
assert.equal(fontFamily('Inter', 'sans-serif'), '"Inter", sans-serif')
assert.equal(fontFamily('  system-ui ', 'sans-serif'), 'system-ui, sans-serif')
assert.equal(fontFamily('Evil"; } body { color: red', 'sans-serif'), '"Evil  body  color: red", sans-serif')
assert.equal(fontFamily('   ', 'sans-serif'), undefined)
assert.equal(vars(DEFAULTS, true)['--sans'], undefined) // bundled Geist from ui.css
assert.equal(vars({ ...DEFAULTS, monoFont: 'Menlo' }, false)['--mono'], `"Menlo", ui-monospace, 'SF Mono', monospace`)

console.log('themes ok')
