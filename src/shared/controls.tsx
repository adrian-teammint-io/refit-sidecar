// Controls shared by the drawer and the popup. Styles live in src/ui.css (.segmented, .themes, .switch).
import { THEMES, type Mode, type Settings } from '../themes'

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
