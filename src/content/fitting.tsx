// Fitting rooms search (pipelines across projects, newest edit first) and one room's view: its Flow (nodes) and the
// connections it reads.
import { useState } from 'react'
import { ago, plural } from '../term'
import { fittingRoomUrl, type FailedSyncs } from '../failed-syncs'
import type { FittingRoom, FittingRoomConnections, FittingRooms, ProjectRef } from '../projects'
import type { Flow } from '../flow'
import { Icon } from '../shared/icons'
import { Segmented } from '../shared/controls'
import { CardHead, pickOnClick, stagger } from '../shared/card'
import { Browse, Empty, SearchBox, useBrowse, type Common, type OpenFailed } from './browse'
import { ConnectionsPanel } from './projects'
import { FlowPanel } from './flow'

const ROOM_TABS = [['flow', 'Flow'], ['connections', 'Connections']] as const

export function FittingRoomsView({ page, query, setQuery, openProject, openRoom, ...c }: {
  page?: FittingRooms; query: { q: string }; setQuery: (q: { q: string }) => void; openProject: (p: ProjectRef) => void; openRoom: (r: FittingRoom) => void
} & Common) {
  const b = useBrowse({ page, query, command: 'fitting-rooms', ...c })
  return (
    <div className="pane">
      <Browse page={page} b={b} run={c.run} now={c.now} command="fitting-rooms" cancel={c.cancel}
        meta={page?.at ? `${page.rows.length}${page.hasMore ? '+' : ''} fitting rooms · newest edit first` : ''}
        empty={<Empty icon="search" title="No matching fitting rooms" text="Search matches fitting room name, project name or id." />}
        rowsFor={rows => (
          <ul className="syncs">
            {(rows as FittingRoom[]).map((r, i) => {
              const url = fittingRoomUrl(r)
              return (
                <li key={r.id} className="sync open-card" style={stagger(i)} tabIndex={0} aria-label={`${r.name}: show its connections`}
                  onClick={pickOnClick(true, () => openRoom(r))} onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) openRoom(r) }}>
                  <CardHead badge={plural(r.nodes, 'node')} title={r.name}
                    link={url ? { href: url, label: `Open ${r.name} in Refit`, title: 'Open fitting room' } : undefined}>
                    {r.notOk > 0 && <span className="pill" data-tone="fail" title="fitdata syncs not in SUCCESS">{r.notOk} not ok</span>}
                  </CardHead>
                  <button className="link-btn" onClick={() => openProject({ id: r.projectId, name: r.project })}><Icon d="folder" size={12} />{r.project}{r.projectStatus === 'PAUSED' && ' · paused'}</button>
                  <p className="sync-meta muted">
                    edited {ago(Date.parse(r.updatedAt), c.now)} · {plural(r.outputs, 'output')}
                    {r.lastFit && <> · last fitdata {ago(Date.parse(r.lastFit), c.now)}</>}
                  </p>
                </li>
              )
            })}
          </ul>
        )}>
        <SearchBox value={query.q} onChange={q => setQuery({ q })} placeholder="Search fitting rooms by name or project" autoFocus />
      </Browse>
    </div>
  )
}

// Flow: the room's nodes step by step (flow.tsx). Connections: the ones it reads (transaction.payload.from), as the
// same cards as a project's Connections tab.
export function FittingRoomView({ room, cache, flow, openProject, openFailed, fs, ...c }: {
  room: FittingRoom; cache?: FittingRoomConnections; flow?: Flow; openProject: (p: ProjectRef) => void; openFailed: OpenFailed; fs?: FailedSyncs
} & Common) {
  const url = fittingRoomUrl(room)
  const [tab, setTab] = useState<'flow' | 'connections'>('flow')
  return (
    <div className="pane">
      <div className="proj-head">
        <div>
          <p className="muted mono">{[plural(room.nodes, 'node'), plural(room.outputs, 'output'), room.id.slice(0, 8)].join(' · ')}</p>
          <button className="link-btn" onClick={() => openProject({ id: room.projectId, name: room.project })}><Icon d="folder" size={12} />{room.project}</button>
        </div>
        {url && <a className="btn primary sm" href={url} target="_top"><Icon d="external" size={13} />Open in Refit</a>}
      </div>
      <Segmented label="Fitting room section" value={tab} options={ROOM_TABS} onChange={setTab} />
      {tab === 'flow'
        ? <FlowPanel room={room} flow={flow} {...c} />
        : <ConnectionsPanel key={room.id} page={cache?.[room.id]} command="fitting-room-connections" extra={{ room: room.id }}
            none="No transaction in this fitting room reads a connection." openFailed={openFailed} fs={fs} {...c} />}
    </div>
  )
}
