// Parsed failed sync_requests as cards. The drawer shows all of them; the popup passes `limit`.
import { useState } from 'react'
import { connectionUrl, dateRange, platform, type FailedSync } from '../failed-syncs'
import { ago } from '../term'
import { Icon } from './icons'

export function SyncList({ rows, now, limit, newTab }: { rows: FailedSync[]; now: number; limit?: number; newTab?: boolean }) {
  const [open, setOpen] = useState<string>()
  const shown = limit ? rows.slice(0, limit) : rows
  return (
    <ul className="syncs">
      {shown.map((r, i) => {
        const url = connectionUrl(r)
        const reason = r.displayReason ?? r.reason ?? 'No reason recorded'
        const expanded = open === r.id
        return (
          <li key={r.id} className="sync" style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
            <div className="sync-head">
              <span className="badge">{platform(r)}</span>
              <strong title={r.name}>{r.name}</strong>
              {url && <a className="icon-btn sync-link" href={url} target={newTab ? '_blank' : '_top'} rel="noreferrer" aria-label={`Open ${r.name} on Refit`} title="Open connection"><Icon d="external" size={14} /></a>}
            </div>
            <p className="sync-meta muted"><span title={r.project}>{r.project}</span> · <span className="mono">{r.type}</span> · <span className="mono">{dateRange(r)}</span></p>
            <button className="sync-reason" data-open={expanded} aria-expanded={expanded} onClick={() => setOpen(expanded ? undefined : r.id)}
              title={expanded ? 'Collapse' : 'Show full reason'}>
              {reason}
            </button>
            {r.displayReason && r.reason && expanded && <pre className="sync-raw">{r.reason}</pre>}
            <p className="sync-foot muted mono"><span>{r.id.slice(0, 8)}</span><span>failed {ago(Date.parse(r.updatedAt), now)}</span></p>
          </li>
        )
      })}
    </ul>
  )
}
