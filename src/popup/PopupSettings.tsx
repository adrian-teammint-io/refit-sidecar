import type { HostState } from '../api'
import type { Settings } from '../themes'
import { APP } from '../failed-syncs'
import { Switch, ThemePicker } from '../shared/controls'
import { HostCard } from '../shared/HostSetup'

export function PopupSettings({ settings, dark, host, onChange }: { settings: Settings; dark: boolean; host?: HostState; onChange: (s: Partial<Settings>) => void }) {
  return (
    <div className="p-settings">
      <section>
        <h2 className="eyebrow">Terminal host</h2>
        <HostCard host={host} />
      </section>

      <section>
        <h2 className="eyebrow">Appearance</h2>
        <ThemePicker settings={settings} dark={dark} onChange={onChange} />
      </section>

      <section className="setting-row">
        <div>
          <strong>Count on the toolbar icon</strong>
          <span className="muted">Failed-sync count on the icon, "!" when the host is missing</span>
        </div>
        <Switch label="Count on the toolbar icon" checked={settings.badge} onChange={badge => onChange({ badge })} />
      </section>

      <nav className="p-links">
        <a href={APP} target="_blank" rel="noreferrer">app.refit.ai</a>
        <a href="options.html" target="_blank" rel="noreferrer">Host setup</a>
        <span className="muted">v{chrome.runtime.getManifest().version}</span>
      </nav>
    </div>
  )
}
