// Connection cards (shared by a project's Connections tab and the all-projects search) and the Connections search view.
import { useEffect, useState, type ReactNode } from 'react'
import { call, MAX_TABS } from '../api'
import { ago } from '../term'
import { dateRange, platform, liveFails, type FailedSyncs } from '../failed-syncs'
import { connectionUrl } from '../links'
import { PLATFORMS, type ProjectConnection, type ConnectionHit, type Connections, type ConnectionSearch, type ProjectRef } from '../projects'
import { Icon } from '../shared/icons'
import { CardHead, ProjectLink, pickOnClick, pickOnDoubleClick, stagger } from '../shared/card'
import { Browse, Empty, SearchBox, pageCount, useBrowse, type Common, type OpenFailed } from './browse'
import { SelectionRow, useSelection } from './ui'
import { GroupAdd, GroupList, listGroups } from './groups'
import type { Groups } from '../groups'

const TONE: Record<string, string> = { SUCCESS: 'ok', FAIL: 'fail' }
const MAX_SELECT = 100 // Select all cap: a group holds at most 100 (MAX_GROUP); Open still takes MAX_TABS at a time

// Copy Markdown: one "- [name](url)" list item per connection, in list order (a list, so renderers keep one per line;
// bare lines would merge into one paragraph). Brackets in a name are escaped.
export const markdownLinks = (rows: ProjectConnection[]) =>
  rows.map(c => `- [${c.name.trim().replace(/([[\]\\])/g, '\\$1')}](${connectionUrl(c)})`).join('\n')

// Select / Done for a connection card list, shown in the list's status line (Browse `tools`).
export function SelectToggle({ selecting, setSelecting, rows }: { selecting: boolean; setSelecting: (v: boolean) => void; rows?: ProjectConnection[] }) {
  if (selecting) return <button className="btn ghost sm" onClick={() => setSelecting(false)}>Done</button>
  if (!rows?.some(r => connectionUrl(r))) return null
  return <button className="btn ghost sm" onClick={() => setSelecting(true)}><Icon d="check" size={13} />Select</button>
}

// Connection cards. groupBy=service adds a header whenever the platform changes (rows arrive sorted by it).
// Select mode (same UX as Failed syncs): Open N in Refit (background tabs, at most MAX_TABS), Copy Markdown (one
// "[name](url)" line each), plus the view's own buttons and panel. Deleting a connection happens in Refit's own dialog,
// which checks fitting rooms and drops the connection's data table and seed view; a plain DELETE here would leave those
// behind (see AGENTS.md).
export function ConnectionList({ rows, now, groupBy, openProject, openFailed, fs, pageAt, selecting, setSelecting, buttons, panel, groupAdd }: {
  rows: (ProjectConnection & { project?: string })[]; now: number; groupBy?: 'service'; openProject?: (p: ProjectRef) => void; openFailed: OpenFailed
  fs?: FailedSyncs; pageAt: number // the Sync requests FAIL list and this page's fetch time, for liveFails
  selecting: boolean; setSelecting: (v: boolean) => void // owned by the panel: its Select toggle lives in the status line
  buttons?: (selected: (ProjectConnection & { project?: string })[], done: () => void) => ReactNode // more bulk-bar buttons (Remove from group)
  panel?: (selected: (ProjectConnection & { project?: string })[], done: () => void) => ReactNode // a bulk-bar section under them (Add to group)
  groupAdd?: (c: ProjectConnection & { project?: string }, close: () => void) => ReactNode // a card's own Add to group form
}) {
  const [open, setOpen] = useState<string>()
  const [adding, setAdding] = useState<string>() // the card whose Add to group form is open

  const [err, setErr] = useState('')
  const selectable = rows.filter(c => connectionUrl(c))
  const sel = useSelection(selectable, c => c.connectionId, MAX_SELECT)
  const { selected, toggle } = sel
  const exit = () => setSelecting(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => { if (!selecting) { sel.clear(); setErr(''); setCopied(false) } }, [selecting])
  const openAll = () => call({ type: 'openTabs', urls: selected.map(c => connectionUrl(c)!) }).then(exit, e => setErr((e as Error).message))
  const copy = () => navigator.clipboard.writeText(markdownLinks(selected)).then(
    () => { setErr(''); setCopied(true); setTimeout(() => setCopied(false), 1600) }, e => setErr(`Could not copy: ${(e as Error).message}`))
  return <>
    {selecting && <p className="list-tools muted">Pick connections</p>}
    <ul className="syncs" data-selecting={selecting}>
      {rows.map((c, i) => {
        const url = connectionUrl(c)
        const { failed, reason } = liveFails(c, pageAt, fs)
        const expanded = open === c.connectionId
        const header = groupBy && (i === 0 || platform(rows[i - 1]) !== platform(c))
        const on = sel.picked.has(c.connectionId)
        const canPick = selecting && !!url
        return (
          <li key={c.connectionId} className="conn-item" style={stagger(i)}>
            {header && <p className="eyebrow group-head">{platform(c)}</p>}
            <div className="sync conn" data-status={c.status ?? 'NEVER'} data-selected={selecting && on} onClick={pickOnClick(canPick, () => toggle(c.connectionId))}
              onDoubleClick={pickOnDoubleClick(!selecting && !!url, () => { setSelecting(true); toggle(c.connectionId) })}>
              <CardHead badge={platform(c)} title={c.name.trim()}
                check={canPick ? { on, label: `Select ${c.name}`, onToggle: () => toggle(c.connectionId) } : undefined}
                link={url && !selecting ? { href: url, label: `Open ${c.name} on Refit`, title: 'Open connection' } : undefined}>
                <span className="pill" data-tone={c.status ? TONE[c.status] ?? 'none' : 'none'}>{c.status ?? 'never synced'}</span>
                {groupAdd && !selecting && (
                  <button className="icon-btn sync-link" aria-expanded={adding === c.connectionId} aria-label={`Add ${c.name.trim()} to group`} title="Add to group"
                    onClick={() => setAdding(adding === c.connectionId ? undefined : c.connectionId)}><Icon d="plus" size={14} /></button>
                )}
              </CardHead>
              {c.project && openProject && (
                <ProjectLink name={c.project} onClick={() => openProject({ id: c.projectId, name: c.project! })} />
              )}
              <p className="sync-meta muted">
                {c.syncType && <><span className="mono">{c.syncType}</span> · </>}
                {c.lastSync ? `last sync ${ago(Date.parse(c.lastSync), now)}` : 'no sync yet'}
                {(c.start || c.end) && <> · <span className="mono">{dateRange(c)}</span></>}
                {failed > 0 && <> · <button className="fail-text fail-link" onClick={() => openFailed(c)} title="Show these failed syncs">{failed} FAIL total</button></>}
              </p>
              {reason && (
                <button className="sync-reason" data-open={expanded} aria-expanded={expanded} onClick={() => setOpen(expanded ? undefined : c.connectionId)}
                  title={expanded ? 'Collapse' : 'Show full reason'}>{reason}</button>
              )}
              {groupAdd && !selecting && adding === c.connectionId && groupAdd(c, () => setAdding(undefined))}
            </div>
          </li>
        )
      })}
    </ul>
    {selecting && (
      <div className="bulk" role="toolbar" aria-label="Selected connections">
        <SelectionRow sel={sel}>{null}</SelectionRow>
        <div className="bulk-actions">
          <button className="btn primary sm" disabled={!selected.length || selected.length > MAX_TABS} onClick={openAll}
            title={selected.length > MAX_TABS ? `Opens at most ${MAX_TABS} tabs at once` : 'Opens each in a background tab'}>
            <Icon d="external" size={13} />Open{selected.length ? ` ${selected.length}` : ''} in Refit
          </button>
          <button className="btn ghost sm" disabled={!selected.length} onClick={copy} title="One [name](url) line per connection">
            <Icon d={copied ? 'check' : 'copy'} size={13} />{copied ? 'Copied' : 'Copy Markdown'}
          </button>
          {buttons?.(selected, exit)}
        </div>
        {(err || selected.length > MAX_TABS) && <p className="bulk-note" data-tone={err ? 'fail' : undefined}>{err || `Open handles ${MAX_TABS} at a time; pick fewer to open them.`}</p>}
        {panel?.(selected, exit)}
      </div>
    )}
  </>
}

export function ConnectionsView({ page, query, setQuery, openProject, openFailed, fs, groups, openGroup, ...c }: {
  page?: Connections; fs?: FailedSyncs; query: ConnectionSearch; setQuery: (q: ConnectionSearch) => void; openProject: (p: ProjectRef) => void; openFailed: OpenFailed
  groups?: Groups; openGroup: (id: string, name: string) => void
} & Common) {
  const b = useBrowse({ page, query, command: 'connections', ...c })
  const [selecting, setSelecting] = useState(false)
  // The group notes, read again once per visit (an agent may have edited them). ponytail: a read, so a search typed
  // while it waits can take its queue slot; the cached list still shows and the next visit reads them again.
  useEffect(() => { if (c.ready) listGroups(c.exec) }, [c.ready])
  return (
    <div className="pane">
      <Browse page={page} b={b} run={c.run} now={c.now} command="connections" cancel={c.cancel}
        meta={page?.at ? `${pageCount(page, 'connections')}${page.query.platform && page.query.platform !== 'all' ? ` on ${page.query.platform}` : ''}${page.query.q ? ` matching "${page.query.q}"` : ''}` : ''}
        empty={<Empty icon="search" title="No matching connections" text="Search matches connection name, platform (META, TIKTOK…) or id." />}
        tools={<SelectToggle selecting={selecting} setSelecting={setSelecting} rows={page?.rows} />}
        rowsFor={rows => <>
          {!selecting && <GroupList groups={groups} now={c.now} open={openGroup} exec={c.exec} />}
          <ConnectionList rows={rows as ConnectionHit[]} now={c.now} openProject={openProject} openFailed={openFailed} fs={fs} pageAt={page?.at ?? 0} selecting={selecting} setSelecting={setSelecting}
            panel={(sel, done) => <GroupAdd groups={groups} rows={sel as ConnectionHit[]} done={done} exec={c.exec} />}
            groupAdd={(conn, close) => <GroupAdd groups={groups} rows={[conn as ConnectionHit]} done={close} card exec={c.exec} />} />
        </>}>
        <SearchBox value={query.q} onChange={q => setQuery({ ...query, q })} placeholder="Search connections by name, platform or id" autoFocus />
        <div className="filters">
          <label className="filter-select">
            <select aria-label="Platform" value={query.platform} onChange={e => setQuery({ ...query, platform: e.target.value as ConnectionSearch['platform'] })}>
              <option value="all">All platforms</option>
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <Icon d="chevron" size={13} />
          </label>
        </div>
      </Browse>
    </div>
  )
}
