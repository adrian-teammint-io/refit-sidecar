import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/jetbrains-mono/wght.css'
import './popup.css'
import { call } from '../api'
import { vars } from '../themes'
import { ago, runStatus } from '../term'
import { APP } from '../failed-syncs'
import { useStore, useDark, useNow, isRunning, saveSettings } from '../shared/store'
import { Icon, IconBtn } from '../shared/icons'
import { Segmented } from '../shared/controls'
import { Terminal } from '../shared/Terminal'
import { SyncList } from '../shared/SyncList'
import { HostSetup, hostProblem } from '../shared/HostSetup'
import { PopupSettings } from './PopupSettings'

const SHOWN = 4 // rows that fit under 600px; the drawer lists the rest

// Toolbar popup: last run summary, the newest failures, and the raw output. Renders straight from storage.
function Popup() {
  const { settings, host, run, output, failedSyncs: fs, loaded } = useStore()
  const [view, setView] = useState<'summary' | 'output' | 'settings'>('summary')
  const [error, setError] = useState('')
  const running = isRunning(run)
  const now = useNow(true, running ? 250 : 30_000)
  const dark = useDark(settings)
  const theme = vars(settings.theme, dark)
  useEffect(() => { document.documentElement.style.background = theme['--bg'] }, [theme['--bg']])
  const n = fs?.rows.length ?? 0
  const st = run && runStatus(run, now)

  async function runIt() {
    setError('')
    try { await call({ type: 'run', command: 'failed-syncs' }) } catch (e) { setError((e as Error).message) }
  }
  const cancel = () => call({ type: 'cancel' }).catch(e => setError((e as Error).message))

  return (
    <main className={`root ${dark ? 'dark' : 'light'} popup`} style={theme as React.CSSProperties}
      onKeyDown={e => { if (e.key === 'Escape' && view === 'settings') { e.preventDefault(); setView('summary') } }}>
      <header className="p-head">
        {view === 'settings' && <IconBtn icon="back" label="Back" onClick={() => setView('summary')} />}
        <h1>{view === 'settings' ? 'Settings' : 'Refit failed syncs'}</h1>
        {view !== 'settings' && <>
          <span className="muted p-updated">{running ? 'Running…' : fs?.at ? `Updated ${ago(fs.at, now)}` : ''}</span>
          <IconBtn icon="refresh" label={running ? 'Running…' : 'Run failed-syncs'} onClick={runIt} disabled={running} spin={running} />
          <IconBtn icon="gear" label="Settings" onClick={() => setView('settings')} />
        </>}
      </header>

      {view === 'settings' ? <PopupSettings settings={settings} dark={dark} host={host} onChange={s => saveSettings(settings, s)} /> : <>
        <Segmented label="View" value={view} options={[['summary', 'Summary'], ['output', running ? 'Output ●' : 'Output']] as const} onChange={setView} />

        {view === 'output' ? (
          <div className="p-term"><Terminal output={output} run={run} now={now} onCancel={cancel} /></div>
        ) : !loaded ? null : hostProblem(host) ? (
          <HostSetup host={host} compact />
        ) : <>
          <article className="card p-count" aria-busy={running}>
            <div>
              <p className="eyebrow">Failed sync requests · prod</p>
              <strong className="p-num">{fs ? n : '–'}</strong>
            </div>
            <div className="p-count-side">
              {st && <span className="pill" data-tone={st.tone} title={st.label}>{st.label}</span>}
              {running
                ? <button className="btn ghost" onClick={cancel}><Icon d="stop" size={14} />Cancel</button>
                : <button className="btn primary" onClick={runIt}><Icon d="play" size={14} />Run</button>}
            </div>
          </article>

          {(error || fs?.error) && (
            <div className="banner" role="alert">
              <Icon d="alert" />
              <span>{error || `${fs!.rows.length ? 'Showing the last good result. ' : ''}${fs!.error}`}</span>
              <button className="btn ghost" onClick={() => setView('output')}>Output</button>
            </div>
          )}

          {!fs ? <p className="p-note muted">Not run yet. <b>Run</b> lists every sync_request with status FAIL, read through Tabularis.</p>
            : !n ? <p className="p-note muted"><Icon d="check" size={14} /> No failed syncs.</p>
            : <SyncList rows={fs.rows} now={now} limit={SHOWN} newTab />}
          {n > SHOWN && (
            <button className="btn ghost p-more" onClick={() => chrome.tabs.create({ url: APP })}>
              {n - SHOWN} more in the drawer on app.refit.ai<Icon d="external" size={14} />
            </button>
          )}
        </>}

        <footer className="p-foot muted">
          <span>{host?.state === 'ready' ? 'Host ready' : host?.state === 'connecting' ? 'Connecting to host…' : 'Host unavailable'}</span>
          <span>Tabularis · refit-prod</span>
        </footer>
      </>}
    </main>
  )
}

createRoot(document.getElementById('app')!).render(<Popup />)
