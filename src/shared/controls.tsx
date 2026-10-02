// Controls shared by the drawer and the popup. Styles live in src/ui.css (.segmented, .themes, .switch, .keybinds).
import { useEffect, useState } from 'react'
import { call } from '../api'
import { THEMES, type Mode, type Settings } from '../themes'
import { ACTIONS, KEYBINDS, keyLabel, keysOf, rebind, type Keys } from '../keybinds'

export function Segmented<T extends string | number>({ label, value, options, onChange }: {
  label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} role="radio" aria-checked={value === v} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  )
}

export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
      <span />
    </button>
  )
}

const MODES: readonly (readonly [Mode, string])[] = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]

// UI and mono font: pick or type an installed font's name; empty keeps the bundled one. Applies live through vars()
// (--sans / --mono). Each field previews in its own font. Suggestions are the Mac's installed fonts (the worker reads
// chrome.fontSettings; content scripts can't), mono-looking names first for the mono field; `suggest` if that fails.
const MONO_NAME = /mono|code|menlo|courier|consol|terminal|fixed/i
const FONTS = [
  { key: 'font', label: 'Interface font', bundled: 'Geist', suggest: ['Inter', 'SF Pro Text', 'Helvetica Neue', 'IBM Plex Sans', 'system-ui'] },
  { key: 'monoFont', label: 'Monospace font', bundled: 'JetBrains Mono', suggest: ['SF Mono', 'Menlo', 'Fira Code', 'IBM Plex Mono', 'Berkeley Mono'] },
] as const

export function FontPicker({ settings, onChange }: { settings: Settings; onChange: (s: Partial<Settings>) => void }) {
  const [installed, setInstalled] = useState<string[]>([])
  useEffect(() => { call<string[]>({ type: 'fonts' }).then(f => f?.length && setInstalled(f), () => {}) }, [])
  const monoFirst = [...installed].sort((a, b) => Number(MONO_NAME.test(b)) - Number(MONO_NAME.test(a)))
  return (
    <div className="fonts">
      {FONTS.map(f => {
        const list = !installed.length ? f.suggest : f.key === 'monoFont' ? monoFirst : installed
        return (
          <div key={f.key} className="setting-row">
            <div>
              <strong>{f.label}</strong>
              <span className="muted">{installed.length ? `Pick from ${installed.length} installed fonts` : 'Any font installed on this Mac'}. Empty: {f.bundled}.</span>
            </div>
            <input className="font-input" list={`fonts-${f.key}`} value={settings[f.key] ?? ''} placeholder={f.bundled} maxLength={60} spellCheck={false}
              aria-label={f.label} onChange={e => onChange({ [f.key]: e.target.value })}
              style={{ fontFamily: `var(${f.key === 'font' ? '--sans' : '--mono'})` }} />
            <datalist id={`fonts-${f.key}`}>{list.map(s => <option key={s} value={s} />)}</datalist>
          </div>
        )
      })}
    </div>
  )
}

// Mode segmented + theme swatch grid. Swatches preview the palette in the currently resolved mode.
export function ThemePicker({ settings, dark, onChange }: { settings: Settings; dark: boolean; onChange: (s: Partial<Settings>) => void }) {
  return (
    <>
      <Segmented label="Color mode" value={settings.mode} options={MODES} onChange={mode => onChange({ mode })} />
      <div className="themes" role="radiogroup" aria-label="Theme">
        {Object.entries(THEMES).map(([key, t]) => {
          const [bg, surface, , text, , accent] = t[dark ? 'dark' : 'light']
          return (
            <button key={key} role="radio" aria-checked={settings.theme === key} className="theme" onClick={() => onChange({ theme: key })}>
              <span className="swatch" style={{ background: bg, color: text }}>
                <span style={{ background: surface }} /><span style={{ background: accent }} />
              </span>
              {t.label}
            </button>
          )
        })}
      </div>
    </>
  )
}

// One row per KEYBINDS action. Click the key, press the new one (Esc cancels). Stores only overrides of the defaults.
export function KeybindList({ settings, onChange }: { settings: Settings; onChange: (s: Partial<Settings>) => void }) {
  const keys = keysOf(settings.keys)
  const [capturing, setCapturing] = useState<string>()
  const [error, setError] = useState('')
  const save = (next: Keys) => onChange({ keys: Object.fromEntries(ACTIONS.filter(a => next[a] !== KEYBINDS[a].default).map(a => [a, next[a]])) })
  return (
    <ul className="keybinds">
      {ACTIONS.map(a => {
        const on = capturing === a
        return (
          <li key={a} className="setting-row">
            <div>
              <strong>{KEYBINDS[a].label}</strong>
              <span className={error && on ? 'err' : 'muted'}>{on ? error || 'Press a letter or digit · Esc cancels' : KEYBINDS[a].hint}</span>
            </div>
            {keys[a] !== KEYBINDS[a].default && !on && (
              <button className="link-btn" onClick={() => save({ ...keys, [a]: KEYBINDS[a].default })}>Reset</button>
            )}
            <button className="key-capture" data-capturing={on} aria-label={`${KEYBINDS[a].label} shortcut: ${keyLabel(keys[a])}. Click to change`}
              onClick={() => { setError(''); setCapturing(on ? undefined : a) }} onBlur={() => setCapturing(undefined)}
              onKeyDown={e => {
                if (!on) return
                e.preventDefault(); e.stopPropagation() // the drawer must not act on (or close from) this keypress
                if (e.key === 'Escape') return setCapturing(undefined)
                const r = rebind(keys, a, e.key)
                if ('error' in r) return setError(r.error)
                save(r.keys); setCapturing(undefined)
              }}>
              <kbd>{on ? '…' : keyLabel(keys[a])}</kbd>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
