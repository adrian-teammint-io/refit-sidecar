import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/jetbrains-mono/wght.css'
import './popup.css'
import { call } from '../api'
import { vars } from '../themes'
import { useStore, useDark, saveSettings } from '../shared/store'
import { IconBtn } from '../shared/icons'
import { HostSetup, hostProblem, hostLabel } from '../shared/HostSetup'
import { PopupSettings } from './PopupSettings'
import { AddToGroup } from './AddToGroup'
import { PopupSearch } from './Search'
import { useEnvData, useTab } from './tab'

// Toolbar popup: the groups (on a Refit connection page, a click adds it to one); search connections and open one in Refit. Both on
// the current tab's environment. The toolbar icon still shows the FAIL count (background.ts), from the drawer's fetches.
function Popup() {
  const { settings, host, run, loaded } = useStore()
  const [view, setView] = useState<'main' | 'settings'>('main')
  const dark = useDark(settings)
  const theme = vars(settings, dark)
  useEffect(() => { document.documentElement.style.background = theme['--bg'] }, [theme['--bg']])
  const tab = useTab()
  const data = useEnvData(tab.env)
  const ready = host?.state === 'ready'
  // The group notes may have changed since the drawer last read them (the Groups card shows them).
  useEffect(() => { if (tab.ready && ready) call({ type: 'run', command: 'groups-list', args: { env: tab.env } }).catch(() => {}) }, [tab.ready, tab.env, ready])

  return (
    <main className={`root ${dark ? 'dark' : 'light'} popup`} style={theme as React.CSSProperties}
      onKeyDown={e => { if (e.key === 'Escape' && view === 'settings') { e.preventDefault(); setView('main') } }}>
      <header className="p-head">
        {view === 'settings' && <IconBtn icon="back" label="Back" onClick={() => setView('main')} />}
        <h1>{view === 'settings' ? 'Settings' : 'Refit Sidecar'}</h1>
        {view !== 'settings' && <>
          {tab.env === 'stag' && <span className="p-env">STAG</span>}
          <IconBtn icon="gear" label="Settings" onClick={() => setView('settings')} />
        </>}
      </header>

      {view === 'settings' ? <PopupSettings settings={settings} dark={dark} host={host} onChange={s => saveSettings(settings, s)} /> : <>
        {!loaded || !tab.ready ? null : hostProblem(host) ? <HostSetup host={host} compact /> : <>
          <AddToGroup page={tab.page} env={tab.env} d={data} run={run} ready={ready} />
          <PopupSearch env={tab.env} data={data} run={run} ready={ready} />
        </>}
        <footer className="p-foot muted">
          <span>{hostLabel(host)}</span>
          <span>Tabularis · refit-{tab.env}</span>
        </footer>
      </>}
    </main>
  )
}

createRoot(document.getElementById('app')!).render(<Popup />)
