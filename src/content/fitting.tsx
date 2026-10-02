// Fitting rooms search: pipelines across projects, newest edit first.
import { ago } from '../term'
import { fittingRoomUrl } from '../failed-syncs'
import type { FittingRoom, FittingRooms, ProjectRef } from '../projects'
import { Icon } from '../shared/icons'
import { CardHead, stagger } from '../shared/card'
import { Browse, Empty, SearchBox, useBrowse, type Common } from './browse'

export function FittingRoomsView({ page, query, setQuery, openProject, ...c }: {
  page?: FittingRooms; query: { q: string }; setQuery: (q: { q: string }) => void; openProject: (p: ProjectRef) => void
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
                <li key={r.id} className="sync" style={stagger(i)}>
                  <CardHead badge={`${r.nodes} node${r.nodes === 1 ? '' : 's'}`} title={r.name}
                    link={url ? { href: url, label: `Open ${r.name} in Refit`, title: 'Open fitting room' } : undefined}>
                    {r.notOk > 0 && <span className="pill" data-tone="fail" title="fitdata syncs not in SUCCESS">{r.notOk} not ok</span>}
                  </CardHead>
                  <button className="link-btn" onClick={() => openProject({ id: r.projectId, name: r.project })}><Icon d="folder" size={12} />{r.project}{r.projectStatus === 'PAUSED' && ' · paused'}</button>
                  <p className="sync-meta muted">
                    edited {ago(Date.parse(r.updatedAt), c.now)} · {r.outputs} output{r.outputs === 1 ? '' : 's'}
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
