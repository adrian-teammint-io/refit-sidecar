// Building blocks for the drawer's browse views: debounced server-side search, batch fetching with "load more",
// and the status / error / empty / loading states every list shares.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Args, Command, Run } from '../api'
import { runOk, runStatus } from '../term'
import { BATCH, cleanQuery, sameQuery, toArgs, type Page } from '../projects'
import { isRunning } from '../shared/store'
import { ENV } from '../table'
import { Icon, type IconName } from '../shared/icons'

export type Exec = (command: Command, args?: Args) => void
// What every view gets from App for the one run slot: the current run, the clock, host readiness, run and cancel.
export type Common = { run?: Run; now: number; ready: boolean; exec: Exec; cancel: () => void }
export type OpenFailed = (c: { connectionId: string; name: string }) => void // opens Sync requests for one connection
const MAX_AGE = 30_000 // ms; ponytail: age only, a delete elsewhere within 30s still shows the old counts until refresh

// A status line's count: "30+ projects" while more batches exist, "12 projects" once all are loaded.
export const pageCount = (page: Page<unknown, object>, noun: string) => `${page.rows.length}${page.hasMore ? '+' : ''} ${noun}`

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [JSON.stringify(value)])
  return v
}

// A run belongs to a view when it's the same command, for this tab's environment, with the view's extra args.
const runMatches = (run: Run | undefined, command: Command, extra: Args = {}) =>
  !!run && run.command === command && (run.args?.env ?? 'prod') === ENV && Object.entries(extra).every(([k, v]) => run.args?.[k] === v)

// The one run slot as one view's command sees it: `mine` while it runs, `busy` = the other command running (the
// worker runs one at a time), `last` = its finished run, `ok` when that run exited clean.
export function commandState(run: Run | undefined, command: Command, extra: Args = {}) {
  const matches = runMatches(run, command, extra)
  const running = isRunning(run)
  const last = !running && matches ? run : undefined
  return { mine: running && matches, busy: running && !matches ? run!.command : undefined, last, ok: !!last && runOk(last) }
}

// Fetches the first batch whenever the (debounced) query differs from the stored page's, and exposes "load more".
export function useBrowse<Q extends { q: string } & Record<string, string>, T>({ page, query, command, extra = {}, run, ready, exec }: {
  page?: Page<T, Q>; query: Q; command: Command; extra?: Args; run?: Run; ready: boolean; exec: Exec
}) {
  extra = { ...extra, env: ENV } // every fetch goes to this tab's environment
  const wanted = useDebounced({ ...query, q: cleanQuery(query.q) })
  const asked = useRef('') // the last query we requested, so a re-render doesn't re-request it
  const key = JSON.stringify([command, extra, wanted])
  const fresh = !!page && sameQuery(page.query, wanted)
  // A page cached from an earlier visit still shows at once, but is fetched again in the background when it's older
  // than MAX_AGE: otherwise statuses and FAIL counts stay as they were whenever the page was first loaded.
  const [old] = useState(() => !!page && Date.now() - page.at > MAX_AGE)
  useEffect(() => {
    if (!ready || (fresh && !old) || asked.current === key) return
    asked.current = key
    exec(command, toArgs(wanted, 0, extra))
  }, [ready, key, fresh])
  const { mine } = commandState(run, command, extra)
  return {
    fresh,
    loading: mine && run!.args?.offset === '0',
    loadingMore: mine && run!.args?.offset !== '0',
    refresh: () => { asked.current = key; exec(command, toArgs(wanted, 0, extra)) },
    loadMore: () => page && exec(command, toArgs(page.query, page.rows.length, extra)),
  }
}

// `tools`: view buttons (e.g. Select) laid out in the same flex row, so they never overlap Refresh / Cancel.
// The refresh button carries data-refetch: the drawer's Refetch shortcut (keybinds.ts) clicks it (App.tsx).
export function StatusLine({ run, now, command, extra, loading, meta, tools, onRefresh, onCancel }: {
  run?: Run; now: number; command: Command; extra?: Args; loading: boolean; meta: string; tools?: ReactNode; onRefresh: () => void; onCancel: () => void
}) {
  const { mine, busy, last, ok } = commandState(run, command, extra)
  return (
    <RunBar text={mine ? (loading ? 'Searching…' : 'Loading more…') : busy ? `Queued after ${busy}` : meta}
      pill={last && !ok ? runStatus(last, now) : undefined} tools={tools} running={mine} onCancel={onCancel}
      refresh={<button className="icon-btn sm" onClick={onRefresh} aria-label="Refresh" title="Refresh" data-refetch><Icon d="refresh" size={14} /></button>} />
  )
}

// The status row above a list: what's happening, a run-status pill, the view's tools, then Cancel while its command
// runs, else its refresh control (absent: nothing to refresh right now).
export function RunBar({ text, pill, tools, running, onCancel, refresh }: {
  text: ReactNode; pill?: { label: string; tone: string }; tools?: ReactNode; running: boolean; onCancel: () => void; refresh?: ReactNode
}) {
  return (
    <div className="runbar">
      <span className="muted">{text}</span>
      <span className="spacer" />
      {pill && <span className="pill" data-tone={pill.tone} title={pill.label}>{pill.label}</span>}
      {tools}
      {running ? <button className="btn ghost sm" onClick={onCancel}><Icon d="stop" size={13} />Cancel</button> : refresh}
    </div>
  )
}

export function ErrorBanner({ error, hasRows }: { error?: string; hasRows: boolean }) {
  if (!error) return null
  return (
    <div className="banner" role="alert">
      <Icon d="alert" />
      <span>{hasRows ? 'Showing the last good result. ' : ''}{error}</span>
    </div>
  )
}

export function Empty({ icon, title, text }: { icon: IconName; title: string; text: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon d={icon} size={22} /></div>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  )
}

export const Skeleton = ({ rows = 6 }: { rows?: number }) => (
  <div className="skeleton-list" aria-busy="true">{Array.from({ length: rows }, (_, i) => <div key={i} className="skel" style={{ '--i': i } as React.CSSProperties} />)}</div>
)

export function SearchBox({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus) ref.current?.focus() }, [])
  return (
    <label className="search">
      <Icon d="search" />
      <input ref={ref} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} maxLength={100}
        onKeyDown={e => { if (e.key === 'Escape' && value) { e.stopPropagation(); onChange('') } }} />
      {value && <button className="icon-btn sm" aria-label="Clear search" title="Clear" onClick={() => onChange('')}><Icon d="x" size={14} /></button>}
    </label>
  )
}

// Fetches the next batch by itself when the button scrolls into view (once per batch, so a failed fetch doesn't
// loop: after an error the button is there to retry by hand).
export function LoadMore({ page, loadingMore, onClick }: { page?: Page<unknown, object>; loadingMore: boolean; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const tried = useRef(-1) // rows.length we last auto-loaded at
  const n = page?.rows.length ?? 0
  const auto = !!page?.hasMore && !loadingMore && !page.error
  useEffect(() => {
    const el = ref.current
    if (!el || !auto) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting && tried.current !== n) { tried.current = n; onClick() } }, { rootMargin: '0px 0px 200px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [auto, n])
  if (!page?.hasMore) return page?.rows.length ? <p className="hint muted center">All {page.rows.length} loaded</p> : null
  return (
    <button ref={ref} className="btn ghost load-more" onClick={onClick} disabled={loadingMore} aria-busy={loadingMore}>
      {loadingMore ? 'Loading…' : `Load ${BATCH} more`}<span className="muted">{page.rows.length} shown</span>
    </button>
  )
}

// One browse view's skeleton: search, filters, status, banner, rows (dimmed while a new query loads), load more.
export function Browse<T>({ page, b, rowsFor, empty, children, ...status }: {
  page?: Page<T, object>; b: ReturnType<typeof useBrowse>; rowsFor: (rows: T[]) => ReactNode; empty: ReactNode; children?: ReactNode
} & Omit<Parameters<typeof StatusLine>[0], 'loading' | 'onRefresh' | 'onCancel'> & { cancel: () => void }) {
  const { cancel, ...line } = status
  return <>
    {children}
    <StatusLine {...line} loading={b.loading} onRefresh={b.refresh} onCancel={cancel} />
    <ErrorBanner error={page?.error} hasRows={!!page?.rows.length} />
    {!page ? <Skeleton /> : !page.rows.length ? (b.loading ? <Skeleton /> : empty) : (
      <div className="results" data-stale={!b.fresh || b.loading}>
        {rowsFor(page.rows)}
        <LoadMore page={page as Page<unknown, object>} loadingMore={b.loadingMore} onClick={b.loadMore} />
      </div>
    )}
  </>
}

