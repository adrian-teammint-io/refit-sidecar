import { useEffect, useRef, useState, type ReactNode } from 'react'
import { call, type Args, type Command } from '../api'
import { vars } from '../themes'
import { runStatus } from '../term'
import type { Project } from '../projects'
import { useStore, useDark, useNow, isRunning, saveSettings } from '../shared/store'
import { Icon, IconBtn } from '../shared/icons'
import { Terminal } from '../shared/Terminal'
import { HostSetup, hostProblem, hostLabel, hostTone } from '../shared/HostSetup'
import { SettingsView } from './Settings'
import { Home, FailedView, ProjectsView, ProjectView, type ProjectFilter } from './views'

// A stack of views: Home lists the commands, each command opens its own view, Back pops.
type View =
  | { kind: 'home' }
  | { kind: 'failed' }
  | { kind: 'projects' }
  | { kind: 'project'; project: Pick<Project, 'id' | 'name'> & Partial<Project> }
  | { kind: 'output' }
  | { kind: 'settings' }

// Which command the header's refresh button re-runs in each view.
const REFRESH: Partial<Record<View['kind'], Command>> = { failed: 'failed-syncs', projects: 'projects', project: 'project-connections' }

export function App() {
  const store = useStore()
  const { settings, host, run, output, failedSyncs: fs, projects, projectConnections, loaded } = store
  const [open, setOpen] = useState(false)
  const [stack, setStack] = useState<View[]>([{ kind: 'home' }])
  const [filter, setFilter] = useState<ProjectFilter>({ q: '', status: 'all' }) // kept here so Back to Projects keeps the search
  const [toast, setToast] = useState('')
  const startedHere = useRef<string>(undefined) // run id started from this tab, for the "done" toast
  const running = isRunning(run)
  const now = useNow(open, running ? 250 : 30_000)
  const dark = useDark(settings)
  const drawer = useRef<HTMLElement>(null)
  const view = stack.at(-1)!
  const n = fs?.rows.length ?? 0
  const ready = host?.state === 'ready'

  const push = (v: View) => setStack(s => [...s, v])
  const back = () => setStack(s => (s.length > 1 ? s.slice(0, -1) : s))
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(t => (t === msg ? '' : t)), 2400) }

  useEffect(() => {
    if (!run?.endedAt || run.id !== startedHere.current) return
    startedHere.current = undefined
    if (run.exit !== 0 || run.error) return flash(runStatus(run, Date.now()).label)
    const count = run.command === 'failed-syncs' ? `${n} failed sync${n === 1 ? '' : 's'}`
      : run.command === 'projects' ? `${projects?.rows.length ?? 0} projects`
      : `${projectConnections?.[run.args?.project ?? '']?.rows.length ?? 0} connections`
    flash(count)
  }, [run?.endedAt])

  useEffect(() => {
    if (!open) return
    const first = drawer.current?.querySelector<HTMLElement>('.body input, .body .cmd-row, .body .btn.primary') ?? drawer.current?.querySelector<HTMLElement>('.icon-btn')
    first?.focus()
    // Close on any click outside the drawer. Capture phase so page handlers can't swallow it.
    const shadowHost = (drawer.current!.getRootNode() as ShadowRoot).host
    const onDown = (e: PointerEvent) => { if (!e.composedPath().includes(shadowHost)) setOpen(false) }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  async function exec(command: Command, args?: Args) {
    try { startedHere.current = await call<string>({ type: 'run', command, args }) }
    catch (e) { flash((e as Error).message) }
  }
  const cancel = () => call({ type: 'cancel' }).catch(e => flash((e as Error).message))
  const showOutput = () => push({ kind: 'output' })
  const refresh = REFRESH[view.kind]
  const refreshArgs = view.kind === 'project' ? { project: view.project.id } : undefined

  const common = { run, now, ready, exec, cancel, showOutput }
  let body: ReactNode = null
  if (!loaded) body = null
  else if (view.kind === 'settings') body = <SettingsView settings={settings} dark={dark} host={host} onChange={s => saveSettings(settings, s)} />
  else if (view.kind === 'output') body = <div className="pane"><Terminal output={output} run={run} now={now} onCancel={cancel} /></div>
  else if (hostProblem(host)) body = <HostSetup host={host} />
  else if (view.kind === 'home') body = <Home projects={projects} failedSyncs={fs} now={now} open={k => push({ kind: k })} />
  else if (view.kind === 'failed') body = <FailedView fs={fs} {...common} />
  else if (view.kind === 'projects') body = <ProjectsView projects={projects} filter={filter} setFilter={setFilter} openProject={p => push({ kind: 'project', project: p })} {...common} />
  else body = <ProjectView key={view.project.id} project={view.project} cache={projectConnections} {...common} />

  const title = { home: 'Refit Sidecar', failed: 'Failed syncs', projects: 'Projects', project: view.kind === 'project' ? view.project.name : '', output: 'Output', settings: 'Settings' }[view.kind]

  return (
    <div className={`root ${dark ? 'dark' : 'light'}`} style={vars(settings.theme, dark) as React.CSSProperties}>
      <button className="launcher" data-hidden={open} aria-label={`Open Refit Sidecar${n ? `, ${n} failed syncs` : ''}`} title="Refit Sidecar" onClick={() => setOpen(true)}>
        <Icon d="terminal" size={18} />
        {n > 0 && <span className="launcher-count">{n > 99 ? '99+' : n}</span>}
      </button>
      <aside ref={drawer} className="drawer" data-open={open} inert={!open} aria-label="Refit Sidecar"
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); stack.length > 1 ? back() : setOpen(false) } }}>
        <header className="head">
          {stack.length > 1 ? <IconBtn icon="back" label="Back" onClick={back} /> : <span className="mark"><Icon d="terminal" /></span>}
          <h1 title={title}>{title}</h1>
          {refresh && ready && <IconBtn icon="refresh" label={running ? 'Running…' : `Re-run ${refresh}`} onClick={() => exec(refresh, refreshArgs)} disabled={running} spin={running && run?.command === refresh} />}
          {view.kind !== 'output' && view.kind !== 'settings' && (
            <button className="icon-btn" aria-label="Output" title="Raw output of the last run" data-live={running} onClick={showOutput}><Icon d="terminal" /></button>
          )}
          {view.kind !== 'settings' && <IconBtn icon="gear" label="Settings" onClick={() => push({ kind: 'settings' })} />}
          <IconBtn icon="x" label="Close" onClick={() => setOpen(false)} />
        </header>
        <div className="body">{body}</div>
        <footer className="foot">
          {host && <span className="pill" data-tone={hostTone(host)}>{hostLabel(host)}</span>}
          <span className="spacer" />
          <span><kbd>Esc</kbd> {stack.length > 1 ? 'back' : 'close'}</span>
        </footer>
        {toast && <div className="toast" role="status">{toast}</div>}
      </aside>
    </div>
  )
}
