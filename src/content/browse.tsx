// Building blocks for the drawer's browse views: debounced server-side search, batch fetching with "load more",
// and the status / error / empty / loading states every list shares.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Args, Command, Run } from '../api'
import { runStatus } from '../term'
import { BATCH, cleanQuery, sameQuery, toArgs, type Page } from '../projects'
import { isRunning } from '../shared/store'
import { ENV } from '../table'
import { Icon, type IconName } from '../shared/icons'

export type Exec = (command: Command, args?: Args) => void

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [JSON.stringify(value)])
  return v
}

// A run belongs to a view when it's the same command, for this tab's environment, with the view's extra args.
export const runMatches = (run: Run | undefined, command: Command, extra: Args = {}) =>
  !!run && run.command === command && (run.args?.env ?? 'prod') === ENV && Object.entries(extra).every(([k, v]) => run.args?.[k] === v)

// Fetches the first batch whenever the (debounced) query differs from the stored page's, and exposes "load more".
export function useBrowse<Q extends { q: string } & Record<string, string>, T>({ page, query, command, extra = {}, run, ready, exec }: {
  page?: Page<T, Q>; query: Q; command: Command; extra?: Args; run?: Run; ready: boolean; exec: Exec
}) {
  extra = { ...extra, env: ENV } // every fetch goes to this tab's environment
  const wanted = useDebounced({ ...query, q: cleanQuery(query.q) })
  const asked = useRef('') // the last query we requested, so a re-render doesn't re-request it
  const key = JSON.stringify([command, extra, wanted])
  const fresh = !!page && sameQuery(page.query, wanted)
  useEffect(() => {
    if (!ready || fresh || asked.current === key) return
    asked.current = key
    exec(command, toArgs(wanted, 0, extra))
  }, [ready, key, fresh])
  const mine = isRunning(run) && runMatches(run, command, extra)
  return {
    fresh,
    loading: mine && run!.args?.offset === '0',
    loadingMore: mine && run!.args?.offset !== '0',
    refresh: () => { asked.current = key; exec(command, toArgs(wanted, 0, extra)) },
    loadMore: () => page && exec(command, toArgs(page.query, page.rows.length, extra)),
  }
}

export function StatusLine({ run, now, command, extra, loading, meta, onRefresh, onCancel }: {
  run?: Run; now: number; command: Command; extra?: Args; loading: boolean; meta: string; onRefresh: () => void; onCancel: () => void
}) {
  const mine = isRunning(run) && runMatches(run, command, extra)
  const other = isRunning(run) && !mine
  const st = run && !isRunning(run) && runMatches(run, command, extra) && (run.exit !== 0 || run.error) ? runStatus(run, now) : undefined
  return (
    <div className="runbar">
      <span className="muted">{mine ? (loading ? 'Searching…' : 'Loading more…') : other ? `Queued after ${run!.command}` : meta}</span>
      <span className="spacer" />
      {st && <span className="pill" data-tone={st.tone} title={st.label}>{st.label}</span>}
      {mine
        ? <button className="btn ghost sm" onClick={onCancel}><Icon d="stop" size={13} />Cancel</button>
        : <button className="icon-btn sm" onClick={onRefresh} aria-label="Refresh" title="Refresh"><Icon d="refresh" size={14} /></button>}
    </div>
  )
}

export function ErrorBanner({ error, hasRows, onOutput }: { error?: string; hasRows: boolean; onOutput: () => void }) {
  if (!error) return null
  return (
    <div className="banner" role="alert">
      <Icon d="alert" />
      <span>{hasRows ? 'Showing the last good result. ' : ''}{error}</span>
      <button className="btn ghost" onClick={onOutput}>Output</button>
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

export function LoadMore({ page, loadingMore, onClick }: { page?: Page<unknown, object>; loadingMore: boolean; onClick: () => void }) {
  if (!page?.hasMore) return page?.rows.length ? <p className="hint muted center">All {page.rows.length} loaded</p> : null
  return (
    <button className="btn ghost load-more" onClick={onClick} disabled={loadingMore} aria-busy={loadingMore}>
      {loadingMore ? 'Loading…' : `Load ${BATCH} more`}<span className="muted">{page.rows.length} shown</span>
    </button>
  )
}

// One browse view's skeleton: search, filters, status, banner, rows (dimmed while a new query loads), load more.
export function Browse<T>({ page, b, rowsFor, empty, children, ...status }: {
  page?: Page<T, object>; b: ReturnType<typeof useBrowse>; rowsFor: (rows: T[]) => ReactNode; empty: ReactNode; children?: ReactNode
} & Omit<Parameters<typeof StatusLine>[0], 'loading' | 'onRefresh' | 'onCancel'> & { cancel: () => void; showOutput: () => void }) {
  const { cancel, showOutput, ...line } = status
  return <>
    {children}
    <StatusLine {...line} loading={b.loading} onRefresh={b.refresh} onCancel={cancel} />
    <ErrorBanner error={page?.error} hasRows={!!page?.rows.length} onOutput={showOutput} />
    {!page ? <Skeleton /> : !page.rows.length ? (b.loading ? <Skeleton /> : empty) : (
      <div className="results" data-stale={!b.fresh || b.loading}>
        {rowsFor(page.rows)}
        <LoadMore page={page as Page<unknown, object>} loadingMore={b.loadingMore} onClick={b.loadMore} />
      </div>
    )}
  </>
}

