// Connection cards (shared by a project's Connections tab and the all-projects search) and the Connections search view.
import { useEffect, useState } from 'react'
import { call, MAX_TABS } from '../api'
import { ago } from '../term'
import { dateRange, platform, connectionUrl, liveFails, type FailedSyncs } from '../failed-syncs'
import type { ProjectConnection, ConnectionHit, Connections, ProjectRef } from '../projects'
import { Icon } from '../shared/icons'
import { CardHead, pickOnClick, stagger } from '../shared/card'
import { Browse, Empty, SearchBox, useBrowse, type Common, type OpenFailed } from './browse'
import { SelectionRow, useSelection } from './ui'

const TONE: Record<string, string> = { SUCCESS: 'ok', FAIL: 'fail' }

// Select / Done for a connection card list, shown in the list's status line (Browse `tools`).
export function SelectToggle({ selecting, setSelecting, rows }: { selecting: boolean; setSelecting: (v: boolean) => void; rows?: ProjectConnection[] }) {
  if (selecting) return <button className="btn ghost sm" onClick={() => setSelecting(false)}>Done</button>
  if (!rows?.some(r => connectionUrl(r))) return null
  return <button className="btn ghost sm" onClick={() => setSelecting(true)}><Icon d="check" size={13} />Select</button>
}

// Connection cards. groupBy=service adds a header whenever the platform changes (rows arrive sorted by it).
// Select mode (same UX as Failed syncs) opens the chosen connections' Refit pages in background tabs: deleting a
// connection happens there, in Refit's own dialog, which checks fitting rooms and drops the connection's data table
// and seed view. A plain DELETE here would leave those behind (see AGENTS.md).
export function ConnectionList({ rows, now, groupBy, openProject, openFailed, fs, pageAt, selecting, setSelecting }: {
  rows: (ProjectConnection & { project?: string })[]; now: number; groupBy?: 'service'; openProject?: (p: ProjectRef) => void; openFailed: OpenFailed
  fs?: FailedSyncs; pageAt: number // the Sync requests FAIL list and this page's fetch time, for liveFails
  selecting: boolean; setSelecting: (v: boolean) => void // owned by the panel: its Select toggle lives in the status line
}) {
  const [open, setOpen] = useState<string>()

  const [err, setErr] = useState('')
  const selectable = rows.filter(c => connectionUrl(c))
  const sel = useSelection(selectable, c => c.connectionId, MAX_TABS)
  const { selected, toggle } = sel
  const exit = () => setSelecting(false)
  useEffect(() => { if (!selecting) { sel.clear(); setErr('') } }, [selecting])
  const openAll = () => call({ type: 'openTabs', urls: selected.map(c => connectionUrl(c)!) }).then(exit, e => setErr((e as Error).message))
  return <>
    {selecting && <p className="list-tools muted">Pick connections to open in Refit (delete them there)</p>}
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
            <div className="sync conn" data-status={c.status ?? 'NEVER'} data-selected={selecting && on} onClick={pickOnClick(canPick, () => toggle(c.connectionId))}>
              <CardHead badge={platform(c)} title={c.name.trim()}
                check={canPick ? { on, label: `Select ${c.name}`, onToggle: () => toggle(c.connectionId) } : undefined}
                link={url && !selecting ? { href: url, label: `Open ${c.name} on Refit`, title: 'Open connection' } : undefined}>
                <span className="pill" data-tone={c.status ? TONE[c.status] ?? 'none' : 'none'}>{c.status ?? 'never synced'}</span>
              </CardHead>
              {c.project && openProject && (
                <button className="link-btn" onClick={() => openProject({ id: c.projectId, name: c.project! })}><Icon d="folder" size={12} />{c.project}</button>
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
            </div>
          </li>
        )
      })}
    </ul>
    {selecting && (
      <div className="bulk" role="toolbar" aria-label="Selected connections">
        <SelectionRow sel={sel}>
          <button className="btn primary sm" disabled={!selected.length || selected.length > MAX_TABS} onClick={openAll}>
            <Icon d="external" size={13} />Open {selected.length || ''} in Refit
          </button>
        </SelectionRow>
        <p className="bulk-note muted">
          {err || (selected.length > MAX_TABS ? `At most ${MAX_TABS} tabs at once.` : 'Opens each in a background tab. Delete it there: Refit checks fitting rooms and removes its data table.')}
        </p>
      </div>
    )}
  </>
}

export function ConnectionsView({ page, query, setQuery, openProject, openFailed, fs, ...c }: {
  page?: Connections; fs?: FailedSyncs; query: { q: string }; setQuery: (q: { q: string }) => void; openProject: (p: ProjectRef) => void; openFailed: OpenFailed
} & Common) {
  const b = useBrowse({ page, query, command: 'connections', ...c })
  const [selecting, setSelecting] = useState(false)
  return (
    <div className="pane">
      <Browse page={page} b={b} run={c.run} now={c.now} command="connections" cancel={c.cancel}
        meta={page?.at ? `${page.rows.length}${page.hasMore ? '+' : ''} connections${page.query.q ? ` matching "${page.query.q}"` : ''}` : ''}
        empty={<Empty icon="search" title="No matching connections" text="Search matches connection name, platform (META, TIKTOK…) or id." />}
        tools={<SelectToggle selecting={selecting} setSelecting={setSelecting} rows={page?.rows} />}
        rowsFor={rows => <ConnectionList rows={rows as ConnectionHit[]} now={c.now} openProject={openProject} openFailed={openFailed} fs={fs} pageAt={page?.at ?? 0} selecting={selecting} setSelecting={setSelecting} />}>
        <SearchBox value={query.q} onChange={q => setQuery({ q })} placeholder="Search connections in every project" autoFocus />
      </Browse>
    </div>
  )
}
