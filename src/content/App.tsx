import { useEffect, useRef, useState, type ReactNode } from 'react'
import { call } from '../api'
import { vars } from '../themes'
import { ago, runStatus } from '../term'
import { useStore, useDark, useNow, isRunning, saveSettings } from '../shared/store'
import { Icon, IconBtn } from '../shared/icons'
import { Segmented } from '../shared/controls'
import { Terminal } from '../shared/Terminal'
import { SyncList } from '../shared/SyncList'
import { HostSetup, hostProblem, hostLabel, hostTone } from '../shared/HostSetup'
import { SettingsView } from './Settings'

type View = 'results' | 'output' | 'settings'

export function App() {
  const { settings, host, run, output, failedSyncs: fs, loaded } = useStore()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>('results')
  const [toast, setToast] = useState('')
  const startedHere = useRef<string>(undefined) // run id started from this tab, for the "done" toast
  const running = isRunning(run)
  const now = useNow(open, running ? 250 : 30_000)
  const dark = useDark(settings)
  const drawer = useRef<HTMLElement>(null)
  const n = fs?.rows.length ?? 0

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(t => (t === msg ? '' : t)), 2400) }

  useEffect(() => {
    if (!run?.endedAt || run.id !== startedHere.current) return
    startedHere.current = undefined
    flash(run.exit === 0 && !run.error ? `${n} failed sync${n === 1 ? '' : 's'}` : runStatus(run, Date.now()).label)
  }, [run?.endedAt])

  useEffect(() => {
    if (!open) return
    const first = drawer.current?.querySelector<HTMLElement>('.body .btn.primary') ?? drawer.current?.querySelector<HTMLElement>('.icon-btn')
    first?.focus()
    // Close on any click outside the drawer. Capture phase so page handlers can't swallow it.
    const host = (drawer.current!.getRootNode() as ShadowRoot).host
    const onDown = (e: PointerEvent) => { if (!e.composedPath().includes(host)) setOpen(false) }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  async function runIt() {
    try { startedHere.current = await call<string>({ type: 'run', command: 'failed-syncs' }) }
    catch (e) { flash((e as Error).message) }
  }
  const cancel = () => call({ type: 'cancel' }).catch(e => flash((e as Error).message))

  const theme = vars(settings.theme, dark) as React.CSSProperties
  const st = run && runStatus(run, now)

  let body: ReactNode = null
  if (!loaded) body = null
  else if (view === 'settings') body = <SettingsView settings={settings} dark={dark} host={host} onChange={s => saveSettings(settings, s)} />
  else if (view === 'output') body = <div className="pane"><Terminal output={output} run={run} now={now} onCancel={cancel} /></div>
  else if (hostProblem(host)) body = <HostSetup host={host} />
  else body = (
    <div className="pane results">
      <div className="summary">
        <div className="summary-text">
          <strong>{fs ? n : '–'}<span> failed</span></strong>
          <span className="muted">{running ? 'Running…' : fs?.at ? `Updated ${ago(fs.at, now)}` : 'Not run yet'}</span>
        </div>
        {st && !running && <span className="pill" data-tone={st.tone} title={st.label}>{st.label}</span>}
        {running
          ? <button className="btn ghost" onClick={cancel}><Icon d="stop" size={14} />Cancel</button>
          : <button className="btn primary" onClick={runIt}><Icon d="play" size={14} />Fetch FAIL syncs</button>}
      </div>
      {fs?.error && (
        <div className="banner" role="alert">
          <Icon d="alert" />
          <span>{fs.rows.length ? 'Showing the last good result. ' : ''}{fs.error}</span>
          <button className="btn ghost" onClick={() => setView('output')}>Output</button>
        </div>
      )}
      {!fs ? (
        <div className="empty">
          <div className="empty-icon"><Icon d="terminal" size={22} /></div>
          <h2>No results yet</h2>
          <p><b>Fetch FAIL syncs</b> runs <code>failed-syncs</code> in your <code>pnpm server</code> terminal and lists every prod sync_request with status FAIL.</p>
        </div>
      ) : !n && !fs.error ? (
        <div className="empty">
          <div className="empty-icon"><Icon d="check" size={22} /></div>
          <h2>No failed syncs</h2>
          <p>No sync_request on prod has status FAIL.</p>
        </div>
      ) : (
        <>
          <SyncList rows={fs.rows} now={now} />
          {fs.truncated && <p className="hint muted center">Showing the newest {n}. Older failures were cut by the query limit.</p>}
        </>
      )}
    </div>
  )


  return (
    <div className={`root ${dark ? 'dark' : 'light'}`} style={theme}>
      <button className="launcher" data-hidden={open} aria-label={`Open Refit Sidecar${n ? `, ${n} failed syncs` : ''}`} title="Refit Sidecar" onClick={() => setOpen(true)}>
        <Icon d="terminal" size={18} />
        {n > 0 && <span className="launcher-count">{n > 99 ? '99+' : n}</span>}
      </button>
      <aside ref={drawer} className="drawer" data-open={open} inert={!open} aria-label="Refit Sidecar"
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); view === 'settings' ? setView('results') : setOpen(false) } }}>
        <header className="head">
          {view === 'settings' ? <IconBtn icon="back" label="Back" onClick={() => setView('results')} /> : <span className="mark"><Icon d="terminal" /></span>}
          <h1>{view === 'settings' ? 'Settings' : 'Failed syncs'}</h1>
          {view !== 'settings' && <IconBtn icon="refresh" label={running ? 'Running…' : 'Fetch FAIL syncs'} onClick={runIt} disabled={running} spin={running} />}
          {view !== 'settings' && <IconBtn icon="gear" label="Settings" onClick={() => setView('settings')} />}
          <IconBtn icon="x" label="Close" onClick={() => setOpen(false)} />
        </header>
        {view !== 'settings' && (
          <div className="tabs">
            <Segmented label="View" value={view} options={[['results', fs ? `Results · ${n}` : 'Results'], ['output', running ? 'Output ●' : 'Output']] as const} onChange={setView} />
          </div>
        )}
        <div className="body">{body}</div>
        <footer className="foot">
          {host && <span className="pill" data-tone={hostTone(host)}>{hostLabel(host)}</span>}
          <span className="spacer" />
          <span><kbd>Esc</kbd> {view === 'settings' ? 'back' : 'close'}</span>
        </footer>
        {toast && <div className="toast" role="status">{toast}</div>}
      </aside>
    </div>
  )
}
