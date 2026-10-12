// Parsed failed sync_requests as cards. The drawer shows all of them; the popup passes `limit`.
// With `selecting` (the drawer's Failed syncs select mode), a check appears and clicking a card toggles it. Out of it,
// `onPick` (double-click a card) enters select mode with that card picked, and `onDelete` adds an x deleting just it.
// The drawer passes findConnection / findProject: the connection name and project name then open that search, filtered to it.
import { useState } from 'react'
import { dateRange, platform, type FailedSync, type SyncStatus } from '../failed-syncs'
import { connectionUrl } from '../links'
import { ago } from '../term'
import { Icon } from './icons'
import { CardHead, pickOnClick, pickOnDoubleClick, stagger } from './card'

export function SyncList({ rows, now, limit, newTab, status = 'FAIL', selecting, selected, onToggle, pickable, onPick, onDelete, findConnection, findProject }: {
  rows: FailedSync[]; now: number; limit?: number; newTab?: boolean; status?: SyncStatus
  selecting?: boolean; selected?: Set<string>; onToggle?: (id: string) => void
  pickable?: (r: FailedSync) => boolean // select mode: rows that can't be picked show no check
  onPick?: (r: FailedSync) => void; onDelete?: (r: FailedSync) => void
  findConnection?: (r: FailedSync) => void; findProject?: (r: FailedSync) => void
}) {
  const [open, setOpen] = useState<string>()
  const shown = limit ? rows.slice(0, limit) : rows
  return (
    <ul className="syncs" data-selecting={!!selecting}>
      {shown.map((r, i) => {
        const url = connectionUrl(r)
        // Only a FAIL is expected to say why; a row of another status without a reason shows no box.
        const reason = r.displayReason ?? r.reason ?? (status === 'FAIL' ? 'No reason recorded' : undefined)
        const expanded = open === r.id
        const on = !!selected?.has(r.id)
        const canPick = !!selecting && !!onToggle && (!pickable || pickable(r))
        return (
          <li key={r.id} className="sync" data-selected={selecting && on} onClick={pickOnClick(canPick, () => onToggle!(r.id))}
            onDoubleClick={pickOnDoubleClick(!selecting && !!onPick, () => onPick!(r))} style={stagger(i)}>
            {/* The popup (newTab) is height-capped and hides the foot, so it keeps the compact icon link in the head. */}
            <CardHead badge={platform(r)} title={r.name}
              onTitle={findConnection && { label: `Find connection ${r.name}`, onClick: () => findConnection(r) }}
              check={canPick ? { on, label: `Select ${r.name} (${r.id.slice(0, 8)})`, onToggle: () => onToggle!(r.id) } : undefined}
              link={url && newTab ? { href: url, label: `Open ${r.name} in Refit`, title: 'Open in Refit' } : undefined}>
              {status === 'OTHER' && r.status && <span className="pill" data-tone={r.status === 'IN_PROGRESS' ? 'run' : r.status === 'READY' ? 'warn' : 'none'}>{r.status}</span>}
              {r.recoveredAt && (
                <span className="ok-chip" title={`A later SUCCESS covers this end date: ${dateRange({ start: r.recoveredStart ?? null, end: r.recoveredEnd ?? null })}, ran ${ago(Date.parse(r.recoveredAt), now)}`}>
                  <Icon d="check" size={11} />Succeeded after
                </span>
              )}
              {onDelete && !selecting && (
                <button className="icon-btn sync-link" aria-label={`Delete ${r.name} (${r.id.slice(0, 8)})`} title="Delete this sync request"
                  onClick={() => onDelete(r)}><Icon d="x" size={14} /></button>
              )}
            </CardHead>
            <p className="sync-meta muted">{findProject
              ? <button className="text-link" title={`Find project ${r.project}`} onClick={() => findProject(r)}>{r.project}</button>
              : <span title={r.project}>{r.project}</span>} · <span className="mono">{r.type}</span> · <span className="mono">{dateRange(r)}</span></p>
            {reason && (
              <button className="sync-reason" data-open={expanded} aria-expanded={expanded} onClick={() => setOpen(expanded ? undefined : r.id)}
                title={expanded ? 'Collapse' : 'Show full reason'}>
                {reason}
              </button>
            )}
            {r.displayReason && r.reason && expanded && <pre className="sync-raw">{r.reason}</pre>}
            <div className="sync-foot muted mono">
              <span>{r.id.slice(0, 8)} · {status === 'FAIL' ? 'failed' : 'updated'} {ago(Date.parse(r.updatedAt), now)}</span>
              {url && !newTab && (
                <a className="open-link" href={url} target="_blank" rel="noreferrer" aria-label={`Open ${r.name} in Refit`}>
                  Open in Refit<Icon d="external" size={12} />
                </a>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
