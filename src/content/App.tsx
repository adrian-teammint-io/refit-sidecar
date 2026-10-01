import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { call, type Args, type Command } from '../api'
import { vars } from '../themes'
import { runStatus } from '../term'
import { togglePin, type Project, type ProjectsQuery } from '../projects'
import { useStore, useDark, useNow, isRunning, saveSettings } from '../shared/store'
import { Icon, IconBtn } from '../shared/icons'
import { Terminal } from '../shared/Terminal'
import { HostSetup, hostProblem, hostLabel, hostTone } from '../shared/HostSetup'
import { SettingsView } from './Settings'
import { Home, FailedView, ProjectsView, ProjectView, ConnectionsView, FittingRoomsView, type HomeTarget } from './views'
import { useResize } from './resize'

// A stack of views: Home lists the commands, each command opens its own view, Back pops.
type ProjectRef = Pick<Project, 'id' | 'name'> & Partial<Project>
type View =
  | { kind: 'home' }
  | { kind: 'failed' }
  | { kind: 'projects' }
  | { kind: 'connections' }
  | { kind: 'fitting' }
  | { kind: 'project'; project: ProjectRef }
  | { kind: 'output' }
  | { kind: 'settings' }

const TITLES: Record<View['kind'], string> = {
  home: 'Refit Sidecar', failed: 'Failed syncs', projects: 'Projects', connections: 'Connections', fitting: 'Fitting rooms',
  project: '', output: 'Output', settings: 'Settings',
}

// A render error in one view shows here instead of unmounting the whole drawer (and launcher). Keyed by view, so Back clears it.
class ViewBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="pane">
        <div className="banner" role="alert"><Icon d="alert" /><span>This view crashed: {this.state.error.message}. Press Back to go on.</span></div>
      </div>
    )
  }
}

export function App() {
  const store = useStore()
  const { settings, host, run, output, failedSyncs: fs, projects, projectConnections, connections, fittingRooms, pins, loaded } = store
  const [open, setOpen] = useState(false)
  const [stack, setStack] = useState<View[]>([{ kind: 'home' }])
  // Search state lives here so Back keeps what you typed. Initialised from the stored page when there is one.
  const [projectsQuery, setProjectsQuery] = useState<ProjectsQuery>({ q: '', status: 'all', sort: 'active' })
  const [connQuery, setConnQuery] = useState({ q: '' })
  const [fitQuery, setFitQuery] = useState({ q: '' })
  const seeded = useRef(false)
  useEffect(() => {
    if (!loaded || seeded.current) return
    seeded.current = true
    if (projects?.query) setProjectsQuery(projects.query)
    if (connections?.query) setConnQuery(connections.query)
    if (fittingRooms?.query) setFitQuery(fittingRooms.query)
  }, [loaded])
  const [toast, setToast] = useState('')
  const startedHere = useRef<string>(undefined) // run id started from this tab, for the "done" toast
  const running = isRunning(run)
  const now = useNow(open, running ? 250 : 30_000)
  const dark = useDark(settings)
  const drawer = useRef<HTMLElement>(null)
  const view = stack.at(-1)!
  const n = fs?.rows.length ?? 0
  const ready = host?.state === 'ready'
  const resize = useResize(settings.drawerWidth, w => saveSettings(settings, { drawerWidth: w }))

  const push = (v: View) => setStack(s => [...s, v])
  const back = () => setStack(s => (s.length > 1 ? s.slice(0, -1) : s))
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(t => (t === msg ? '' : t)), 2400) }
  const openProject = (p: ProjectRef) => {
    // A ref from a search hit only has id + name; the pinned snapshot (if any) fills in the rest.
    const full = pins?.[p.id] ?? projects?.rows.find(r => r.id === p.id) ?? p
    push({ kind: 'project', project: full })
  }
  const pin = (p: Project) => chrome.storage.local.set({ pins: togglePin(pins ?? {}, p, Date.now()) })

  useEffect(() => {
    if (!run?.endedAt || run.id !== startedHere.current) return
    startedHere.current = undefined
    if (run.exit !== 0 || run.error) return flash(runStatus(run, Date.now()).label)
    if (run.command === 'failed-syncs') flash(`${n} failed sync${n === 1 ? '' : 's'}`)
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
    try {
      const id = await call<string>({ type: 'run', command, args })
      if (id !== 'queued') startedHere.current = id
    } catch (e) { flash((e as Error).message) }
  }
  const cancel = () => call({ type: 'cancel' }).catch(e => flash((e as Error).message))
  const showOutput = () => push({ kind: 'output' })

  const common = { run, now, ready, exec, cancel, showOutput }
  let body: ReactNode = null
  if (!loaded) body = null
  else if (view.kind === 'settings') body = <SettingsView settings={settings} dark={dark} host={host} onChange={s => saveSettings(settings, s)} />
  else if (view.kind === 'output') body = <div className="pane"><Terminal output={output} run={run} now={now} onCancel={cancel} /></div>
  else if (hostProblem(host)) body = <HostSetup host={host} />
  else if (view.kind === 'home') body = <Home pins={pins} failedSyncs={fs} now={now} open={(k: HomeTarget) => push({ kind: k })} openProject={openProject} />
  else if (view.kind === 'failed') body = <FailedView fs={fs} {...common} />
  else if (view.kind === 'projects') body = <ProjectsView projects={projects} pins={pins} query={projectsQuery} setQuery={setProjectsQuery} openProject={openProject} pin={pin} {...common} />
  else if (view.kind === 'connections') body = <ConnectionsView page={connections} query={connQuery} setQuery={setConnQuery} openProject={openProject} {...common} />
  else if (view.kind === 'fitting') body = <FittingRoomsView page={fittingRooms} query={fitQuery} setQuery={setFitQuery} openProject={openProject} {...common} />
  else body = <ProjectView key={view.project.id} project={pins?.[view.project.id] ?? view.project} cache={projectConnections}
    pinned={!!pins?.[view.project.id]} pin={pin} openProject={openProject} {...common} />

  const title = view.kind === 'project' ? view.project.name : TITLES[view.kind]

  return (
    <div className={`root ${dark ? 'dark' : 'light'}`} style={vars(settings.theme, dark) as React.CSSProperties}>
      <button className="launcher" data-hidden={open} aria-label={`Open Refit Sidecar${n ? `, ${n} failed syncs` : ''}`} title="Refit Sidecar" onClick={() => setOpen(true)}>
        <Icon d="terminal" size={18} />
        {n > 0 && <span className="launcher-count">{n > 99 ? '99+' : n}</span>}
      </button>
      <aside ref={drawer} className="drawer" data-open={open} data-resizing={resize.active} inert={!open} aria-label="Refit Sidecar"
        style={{ width: `min(${resize.width}px, calc(100vw - 24px))` }}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); stack.length > 1 ? back() : setOpen(false) } }}>
        <div className="resize" {...resize.handle} />
        <header className="head">
          {stack.length > 1 ? <IconBtn icon="back" label="Back" onClick={back} /> : <span className="mark"><Icon d="terminal" /></span>}
          <h1 title={title}>{title}</h1>
          {view.kind !== 'output' && view.kind !== 'settings' && (
            <button className="icon-btn" aria-label="Output" title="Raw output of the last run" data-live={running} onClick={showOutput}><Icon d="terminal" /></button>
          )}
          {view.kind !== 'settings' && <IconBtn icon="gear" label="Settings" onClick={() => push({ kind: 'settings' })} />}
          <IconBtn icon="x" label="Close" onClick={() => setOpen(false)} />
        </header>
        <div className="body"><ViewBoundary key={`${stack.length}-${view.kind}`}>{body}</ViewBoundary></div>
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
