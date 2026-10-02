import type { HostState } from '../api'
import type { Settings } from '../themes'
import { Switch, ThemePicker } from '../shared/controls'
import { HostCard } from '../shared/HostSetup'

export function SettingsView({ settings, dark, host, onChange }: {
  settings: Settings; dark: boolean; host?: HostState; onChange: (s: Partial<Settings>) => void
}) {
  return (
    <div className="settings">
      <section>
        <h2>Terminal host</h2>
        <HostCard host={host} />
      </section>
      <section>
        <h2>Appearance</h2>
        <ThemePicker settings={settings} dark={dark} onChange={onChange} />
      </section>
      <section className="setting-row">
        <div>
          <strong>Count on the toolbar icon</strong>
          <span className="muted">Show the failed-sync count on the extension icon</span>
        </div>
        <Switch label="Count on the toolbar icon" checked={settings.badge} onChange={badge => onChange({ badge })} />
      </section>
    </div>
  )
}
