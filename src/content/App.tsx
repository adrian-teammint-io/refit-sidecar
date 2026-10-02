import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { call, type Args, type Command } from '../api'
import { vars } from '../themes'
import { actionFor, keyLabel, keysOf } from '../keybinds'
import { plural, runStatus } from '../term'
import { togglePin, type Project, type ProjectRef, type ProjectsQuery } from '../projects'
import { ENV, envKey } from '../table'
import { useStore, useDark, useNow, isRunning, saveSettings } from '../shared/store'
import { Icon, IconBtn } from '../shared/icons'
import { HostSetup, hostProblem, hostLabel, hostTone } from '../shared/HostSetup'
import { defOf, titleOf, type Ctx, type View } from './routes'
import { useResize } from './resize'

// Search state for a browse view, kept here so Back keeps what you typed. Seeded once from the stored page's query.
function useQuery<Q>(initial: Q, stored: Q | undefined, loaded: boolean) {
  const [q, setQ] = useState(initial)
  const seeded = useRef(false)
  useEffect(() => { if (loaded && !seeded.current) { seeded.current = true; if (stored) setQ(stored) } }, [loaded])
  return [q, setQ] as [Q, (v: Q) => void]
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
  const { settings, host, run, failedSyncs: fs, projects, connections, fittingRooms, pins, syncRequests, loaded } = store
  const keys = keysOf(settings.keys)
  const [open, setOpen] = useState(false)
  const [stack, setStack] = useState<View[]>([{ kind: 'home' }])
  const queries = {
    projects: useQuery<ProjectsQuery>({ q: '', status: 'all', sort: 'active' }, projects?.query, loaded),
    connections: useQuery({ q: '' }, connections?.query, loaded),
    fitting: useQuery({ q: '' }, fittingRooms?.query, loaded),
  }
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
  const openFailed = (c: { connectionId: string; name: string }) => push({ kind: 'failed', conn: { id: c.connectionId, name: c.name.trim() } })
  const pin = (p: Project) => chrome.storage.local.set({ [envKey(ENV, 'pins')]: togglePin(pins ?? {}, p, Date.now()) })

  useEffect(() => {
    if (!run?.endedAt || run.id !== startedHere.current) return
    startedHere.current = undefined
    if (run.exit !== 0 || run.error) return flash(run.tail ?? runStatus(run, Date.now()).label)
    if (run.summary) flash(run.summary)
    else if (run.command === 'failed-syncs') {
      const status = run.args?.sync_status
      const k = status === 'IN_PROGRESS' || status === 'FRAGMENTED' ? syncRequests?.[status]?.rows.length ?? 0 : n
      flash(plural(k, `${status === 'IN_PROGRESS' ? 'in progress' : status === 'FRAGMENTED' ? 'fragmented' : 'failed'} sync`))
    }
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

  const ctx: Ctx = {
    store, common: { run, now, ready, exec, cancel }, dark, saveSettings: s => saveSettings(settings, s), queries,
    push, replace: v => setStack(s => [...s.slice(0, -1), v]), openProject, openFailed, pin,
  }
  const def = defOf(view)
  const body = !loaded ? null : hostProblem(host) && !def.noHost ? <HostSetup host={host} /> : def.render(view, ctx)
  // The root crumb reads Home; as the current view it's the drawer's name.
  const crumb = (v: View, i: number) => (i === 0 && stack.length > 1 ? 'Home' : titleOf(v))
  const title = crumb(view, stack.length - 1)

  return (
    <div className={`root ${dark ? 'dark' : 'light'}`} style={vars(settings, dark) as React.CSSProperties}>
      <button className="launcher" data-hidden={open} aria-label={`Open Refit Sidecar${n ? `, ${n} failed syncs` : ''}`} title="Refit Sidecar" onClick={() => setOpen(true)}>
        <Icon d="terminal" size={18} />
        {n > 0 && <span className="launcher-count">{n > 99 ? '99+' : n}</span>}
      </button>
      <aside ref={drawer} className="drawer" data-open={open} data-resizing={resize.active} inert={!open} aria-label="Refit Sidecar"
        style={{ width: `min(${resize.width}px, calc(100vw - 24px))` }}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.stopPropagation(); stack.length > 1 ? back() : setOpen(false) }
          // Refetch (keybinds.ts, default R) clicks the current view's [data-refetch] control (absent while it runs).
          else if (actionFor(e, keys) === 'refetch') {
            const btn = drawer.current?.querySelector<HTMLButtonElement>('.body [data-refetch]:not(:disabled)')
            if (btn) { e.preventDefault(); btn.click() }
          }
        }}>
        <div className="resize" {...resize.handle} />
        <header className="head">
          {stack.length > 1 ? <IconBtn icon="back" label="Back" onClick={back} /> : <span className="mark"><Icon d="terminal" /></span>}
          {/* Breadcrumbs: every view under the current one; clicking one pops back to it. One level up (Home › X) is
              just Back, so crumbs show from two levels deep. */}
          <nav className="crumbs" aria-label="Breadcrumb">
            {stack.length > 2 && stack.slice(0, -1).map((v, i) => (
              <span key={i} className="crumb">
                <button onClick={() => setStack(s => s.slice(0, i + 1))} title={crumb(v, i)}>{crumb(v, i)}</button>
                <Icon d="chevron" size={12} />
              </span>
            ))}
            <h1 title={title} aria-current="page">{title}</h1>
          </nav>
          {ENV === 'stag' && <span className="env-chip" title="staging-app.refit.ai: every command runs on the REFIT_STAG database">STAG</span>}
          {def.header && <IconBtn icon={def.header.icon} label={def.header.label} onClick={() => push(def.header!.open)} />}
          {view.kind !== 'settings' && <IconBtn icon="gear" label="Settings" onClick={() => push({ kind: 'settings' })} />}
          <IconBtn icon="x" label="Close" onClick={() => setOpen(false)} />
        </header>
        <div className="body"><ViewBoundary key={`${stack.length}-${view.kind}`}>{body}</ViewBoundary></div>
        <footer className="foot">
          {host && <span className="pill" data-tone={hostTone(host)}>{hostLabel(host)}</span>}
          <span className="spacer" />
          {stack.length > 1 && view.kind !== 'settings' && <span><kbd>{keyLabel(keys.refetch)}</kbd> refetch</span>}
          <span><kbd>Esc</kbd> {stack.length > 1 ? 'back' : 'close'}</span>
        </footer>
        {toast && <div className="toast" role="status">{toast}</div>}
      </aside>
    </div>
  )
}
