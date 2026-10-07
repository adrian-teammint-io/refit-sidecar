import assert from 'node:assert/strict'
import { fontFamily, vars, DEFAULTS, THEMES } from './themes.ts'

// Every palette, both modes, is readable (WCAG): text and muted >= 4.5:1 on bg, surface and raised (raised holds code,
// chips and the active tab); onAccent >= 4.5 on accent; accent >= 4.5 on a dark bg (badges and links use it as text
// there) and >= 3 on a light one (light mode swaps accent text for --text).
const lum = (hex: string) => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }
for (const [key, t] of Object.entries(THEMES)) {
  for (const mode of ['dark', 'light'] as const) {
    const [bg, surface, raised, text, muted, accent, onAccent] = t[mode]
    const at = (fg: string, b: string, min: number, what: string) => assert.ok(ratio(fg, b) >= min, `${key} ${mode}: ${what} ${ratio(fg, b).toFixed(2)} < ${min}`)
    for (const b of [bg, surface, raised]) { at(text, b, 4.5, `text on ${b}`); at(muted, b, 4.5, `muted on ${b}`) }
    at(onAccent, accent, 4.5, 'onAccent on accent')
    at(accent, bg, mode === 'dark' ? 4.5 : 3, 'accent on bg')
    assert.notEqual(text, muted, `${key} ${mode}: muted must differ from text`)
  }
}

// A typed font name only ever becomes a quoted family name (generics stay bare); '' keeps the bundled font.
assert.equal(fontFamily('Inter', 'sans-serif'), '"Inter", sans-serif')
assert.equal(fontFamily('  system-ui ', 'sans-serif'), 'system-ui, sans-serif')
assert.equal(fontFamily('Evil"; } body { color: red', 'sans-serif'), '"Evil  body  color: red", sans-serif')
assert.equal(fontFamily('   ', 'sans-serif'), undefined)
assert.equal(vars(DEFAULTS, true)['--sans'], undefined) // bundled Geist from ui.css
assert.equal(vars({ ...DEFAULTS, monoFont: 'Menlo' }, false)['--mono'], `"Menlo", ui-monospace, 'SF Mono', monospace`)

console.log('themes ok')
