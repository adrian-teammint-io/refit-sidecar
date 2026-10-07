// Popup: search connections in every project (the connections command, on the tab's environment; its page is the
// drawer's Connections search page for that env) and open one in Refit in a new tab.
import { useEffect, useState } from 'react'
import { call, type Run } from '../api'
import type { Env } from '../table'
import { connectionUrl, appOf } from '../links'
import { cleanQuery, fromHex, toHex } from '../projects'
import { platform } from '../failed-syncs'
import { isRunning } from '../shared/store'
import { Icon } from '../shared/icons'
import type { TabData } from './tab'

export function PopupSearch({ env, data, run, ready }: { env: Env; data: TabData; run?: Run; ready: boolean }) {
  const [q, setQ] = useState('')
  const [wanted, setWanted] = useState('') // q, debounced
  useEffect(() => { const t = setTimeout(() => setWanted(cleanQuery(q)), 300); return () => clearTimeout(t) }, [q])
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!ready || !wanted) return
    call({ type: 'run', command: 'connections', args: { env, q: toHex(wanted), platform: 'all', offset: '0' } }).then(() => setErr(''), e => setErr((e as Error).message))
  }, [ready, wanted, env])
  const page = data.connections
  const fresh = !!page && page.query.q === wanted && (page.query.platform ?? 'all') === 'all'
  const searching = isRunning(run) && run!.command === 'connections' && run!.args?.env === env && fromHex(run!.args?.q ?? '') === wanted
  const rows = fresh ? page!.rows : []
  return (
    <section className="p-search" aria-label="Search connections">
      <label className="p-search-box">
        <Icon d="search" size={15} />
        <input className="text-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search connections by name, platform or id" aria-label="Search connections"
          maxLength={100} autoFocus onKeyDown={e => { if (e.key === 'Escape' && q) { e.preventDefault(); setQ('') } }} />
      </label>
      {!ready ? <p className="muted p-hint">Start <code>pnpm server</code> to search.</p>
        : !wanted ? null
        : err || (fresh && page!.error) ? <p className="err">{err || page!.error}</p>
        : !fresh ? <p className="muted p-hint">{searching ? 'Searching…' : 'Waiting for the server…'}</p>
        : !rows.length ? <p className="muted p-hint">No matching connections.</p>
        : (
          <ul className="p-hits">
            {rows.map(r => {
              const url = connectionUrl(r, appOf(env))
              return (
                <li key={r.connectionId}>
                  <span className="badge">{platform(r)}</span>
                  <span className="p-hit-main"><strong title={r.name.trim()}>{r.name.trim()}</strong><span className="muted">{r.project}</span></span>
                  <button className="btn ghost sm" disabled={!url} onClick={() => url && chrome.tabs.create({ url })} aria-label={`Open ${r.name.trim()} in Refit`}>
                    <Icon d="external" size={12} />Open
                  </button>
                </li>
              )
            })}
            {page!.hasMore && <li className="muted p-hint">Showing the first {rows.length}. Type more to narrow it.</li>}
          </ul>
        )}
    </section>
  )
}
