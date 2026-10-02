// Parsed failed sync_requests as cards. The drawer shows all of them; the popup passes `limit`.
// With `selecting` (the drawer's Failed syncs select mode), a check appears and clicking a card toggles it.
import { useState } from 'react'
import { connectionUrl, dateRange, platform, type FailedSync, type SyncStatus } from '../failed-syncs'
import { ago } from '../term'
import { Icon } from './icons'

export function SyncList({ rows, now, limit, newTab, status = 'FAIL', selecting, selected, onToggle }: {
  rows: FailedSync[]; now: number; limit?: number; newTab?: boolean; status?: SyncStatus
  selecting?: boolean; selected?: Set<string>; onToggle?: (id: string) => void
}) {
  const [open, setOpen] = useState<string>()
  const shown = limit ? rows.slice(0, limit) : rows
  return (
    <ul className="syncs" data-selecting={!!selecting}>
      {shown.map((r, i) => {
        const url = connectionUrl(r)
        // Only a FAIL is expected to say why; an IN_PROGRESS / FRAGMENTED row without a reason shows no box.
        const reason = r.displayReason ?? r.reason ?? (status === 'FAIL' ? 'No reason recorded' : undefined)
        const expanded = open === r.id
        const on = !!selected?.has(r.id)
        // In select mode the whole card toggles, except its own links and buttons.
        const pick = selecting && onToggle ? (e: React.MouseEvent) => { if (!(e.target as Element).closest('a, button')) onToggle(r.id) } : undefined
        return (
          <li key={r.id} className="sync" data-selected={selecting && on} onClick={pick} style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
            <div className="sync-head">
              {selecting && onToggle && (
                <button className="check" role="checkbox" aria-checked={on} aria-label={`Select ${r.name} (${r.id.slice(0, 8)})`} onClick={() => onToggle(r.id)}>
                  <Icon d="check" size={12} />
                </button>
              )}
              <span className="badge">{platform(r)}</span>
              <strong title={r.name}>{r.name}</strong>
              {r.recoveredAt && (
                <span className="ok-chip" title={`A later SUCCESS covers this end date: ${dateRange({ start: r.recoveredStart ?? null, end: r.recoveredEnd ?? null })}, ran ${ago(Date.parse(r.recoveredAt), now)}`}>
                  <Icon d="check" size={11} />Succeeded after
                </span>
              )}
              {/* The popup (newTab) is height-capped and hides the foot, so it keeps the compact icon link here. */}
              {url && newTab && <a className="icon-btn sync-link" href={url} target="_blank" rel="noreferrer" aria-label={`Open ${r.name} in Refit`} title="Open in Refit"><Icon d="external" size={14} /></a>}
            </div>
            <p className="sync-meta muted"><span title={r.project}>{r.project}</span> · <span className="mono">{r.type}</span> · <span className="mono">{dateRange(r)}</span></p>
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
                <a className="open-link" href={url} target="_top" aria-label={`Open ${r.name} in Refit`}>
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
