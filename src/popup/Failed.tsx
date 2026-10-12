// Popup: the tab environment's FAIL sync requests (the drawer's failed-syncs store, Fetch reruns it) and Open all:
// each failing connection's Refit page once, MAX_TABS background tabs per click, like a group's Open all.
import { useState } from 'react'
import { call, MAX_TABS, type Run } from '../api'
import type { Env } from '../table'
import { connectionUrl, appOf } from '../links'
import { dateRange, platform, type FailedSync } from '../failed-syncs'
import { ago, plural } from '../term'
import { isRunning, useNow } from '../shared/store'
import { Icon } from '../shared/icons'
import type { TabData } from './tab'

export function PopupFailed({ env, data, run, ready }: { env: Env; data: TabData; run?: Run; ready: boolean }) {
  const fs = data.failedSyncs
  const now = useNow(true, 30_000)
  const [err, setErr] = useState('')
  const [batch, setBatch] = useState(0)
  const fetching = isRunning(run) && run!.command === 'failed-syncs' && run!.args?.env === env
  const fetch = () => call({ type: 'run', command: 'failed-syncs', args: { env, sync_status: 'FAIL' } }).then(() => setErr(''), e => setErr((e as Error).message))
  const rows = fs?.rows ?? []
  const url = (r: FailedSync) => connectionUrl(r, appOf(env))
  const urls = [...new Set(rows.map(url).filter((u): u is string => !!u))]
  const from = Math.min(batch * MAX_TABS, Math.max(urls.length - 1, 0))
  const chunk = urls.slice(from, from + MAX_TABS)
  const openAll = () => call({ type: 'openTabs', urls: chunk }).then(
    () => { setErr(''); setBatch(from + MAX_TABS >= urls.length ? 0 : batch + 1) }, e => setErr((e as Error).message))
  return (
    <article className="card p-group" aria-busy={fetching}>
      <div className="cgroup-list-head">
        <p className="eyebrow">Failed sync requests{fs ? ` · ${rows.length}` : ''}</p>
        {ready && <button className="link-btn" disabled={fetching} onClick={fetch}><Icon d="refresh" size={12} />{fetching ? 'Fetching…' : fs ? 'Refetch' : 'Fetch'}</button>}
      </div>
      {!ready ? <p className="muted p-group-id">Start <code>pnpm server</code> to fetch.</p>
        : !fs ? <p className="muted p-group-id">Not fetched yet.</p>
        : <>
            <p className="muted p-group-id">{rows.length ? `${plural(urls.length, 'connection')} · ` : 'No failed syncs · '}updated {ago(fs.at, now)}</p>
            {!!urls.length && (
              <button className="btn primary sm" onClick={openAll} title={urls.length > MAX_TABS ? `${MAX_TABS} tabs at a time; click again for the next ones` : 'Opens each connection in a background tab'}>
                <Icon d="external" size={13} />{urls.length <= MAX_TABS ? `Open all ${urls.length} in Refit` : `Open ${from + 1}-${from + chunk.length} of ${urls.length} in Refit`}
              </button>
            )}
            {!!rows.length && (
              <ul className="p-hits p-fails">
                {rows.map(r => {
                  const u = url(r)
                  return (
                    <li key={r.id}>
                      <span className="badge">{platform(r)}</span>
                      <span className="p-hit-main"><strong title={r.name.trim()}>{r.name.trim()}</strong><span className="muted">{r.project} · {dateRange(r)}</span></span>
                      <button className="btn ghost sm" disabled={!u} onClick={() => u && chrome.tabs.create({ url: u })} aria-label={`Open ${r.name.trim()} in Refit`}>
                        <Icon d="external" size={12} />Open
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>}
      {(err || fs?.error) && <p className="err">{err || fs!.error}</p>}
    </article>
  )
}
