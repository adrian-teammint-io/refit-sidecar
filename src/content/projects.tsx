// Projects (search, filters, pins) and one project's view: its Connections and Members tabs. ConnectionsPanel is
// also a fitting room's list (fitting.tsx).
import { useState } from 'react'
import { ago, plural } from '../term'
import type { FailedSyncs } from '../failed-syncs'
import { projectUrl } from '../links'
import {
  pinnedFor, type Project, type ProjectRef, type Pins, type Projects, type ProjectConnection, type ProjectConnections, type ProjectsQuery,
  type ConnectionsQuery, type ProjectMembers, type UserSearch, type Page,
} from '../projects'
import type { Args, Command } from '../api'
import { Icon } from '../shared/icons'
import { Segmented } from '../shared/controls'
import { MembersPanel } from './members'
import { OpenInRefit } from '../shared/card'
import { Browse, Empty, SearchBox, pageCount, useBrowse, type Common, type OpenFailed } from './browse'
import { ConnectionList, SelectToggle } from './connections'

const STATUSES = [['all', 'All'], ['ACTIVE', 'Active'], ['PAUSED', 'Paused']] as const
const PROJECT_SORTS = [['active', 'Active first'], ['name', 'Name'], ['recent', 'Recent sync']] as const

function ProjectRow({ p, now, pinned, onOpen, onPin, onDuplicate }: {
  p: Project; now: number; pinned: boolean; onOpen: () => void; onPin: () => void; onDuplicate: () => void
}) {
  return (
    <li className="proj-row">
      <button className="proj" onClick={onOpen} data-paused={p.status === 'PAUSED'}>
        <span className="proj-main">
          <strong title={p.name}>{p.name}</strong>
          <span className="muted mono">{plural(p.connections, 'conn')} · {p.lastSync ? `synced ${ago(Date.parse(p.lastSync), now)}` : 'never synced'}</span>
        </span>
        {p.failed > 0 && <span className="count-chip" title={`${p.failed} FAIL sync_requests`}>{p.failed}</span>}
        {p.plan && <span className="badge">{p.plan}</span>}
        {p.status === 'PAUSED' && <span className="badge muted-badge">PAUSED</span>}
        <Icon d="chevron" />
      </button>
      <button className="icon-btn sm pin" aria-label={`Duplicate ${p.name}`} title="Duplicate: new project with the same members" onClick={onDuplicate}>
        <Icon d="copy" size={14} />
      </button>
      <button className="icon-btn sm pin" aria-pressed={pinned} aria-label={pinned ? `Unpin ${p.name}` : `Pin ${p.name}`} title={pinned ? 'Unpin' : 'Pin to top'} onClick={onPin}>
        <Icon d="pin" size={14} />
      </button>
    </li>
  )
}

export function ProjectsView({ projects, pins, query, setQuery, openProject, pin, duplicate, ...c }: {
  projects?: Projects; pins?: Pins; query: ProjectsQuery; setQuery: (q: ProjectsQuery) => void
  openProject: (p: ProjectRef) => void; pin: (p: Project) => void; duplicate: (p: Project) => void
} & Common) {
  const b = useBrowse({ page: projects, query, command: 'projects', ...c })
  const pinned = pinnedFor(pins ?? {}, query.q, query.status)
  const pinnedIds = new Set(Object.keys(pins ?? {}))
  const row = (p: Project) => <ProjectRow key={p.id} p={p} now={c.now} pinned={pinnedIds.has(p.id)} onOpen={() => openProject(p)} onPin={() => pin(p)} onDuplicate={() => duplicate(p)} />
  return (
    <div className="pane">
      <Browse page={projects} b={b} run={c.run} now={c.now} command="projects" cancel={c.cancel}
        meta={projects?.at ? `${pageCount(projects, 'projects')} · updated ${ago(projects.at, c.now)}` : ''}
        empty={<Empty icon="search" title="No matching projects" text="Try other words, or another status." />}
        rowsFor={rows => <>
          {!!pinned.length && <><p className="eyebrow">Pinned</p><ul className="proj-list">{pinned.map(row)}</ul><p className="eyebrow">All projects</p></>}
          <ul className="proj-list">{rows.map(row)}</ul>
        </>}>
        <SearchBox value={query.q} onChange={q => setQuery({ ...query, q })} placeholder="Search projects by name, id or plan" autoFocus />
        <div className="filters">
          <Segmented label="Status" value={query.status} options={STATUSES} onChange={status => setQuery({ ...query, status })} />
          <Segmented label="Sort" value={query.sort} options={PROJECT_SORTS} onChange={sort => setQuery({ ...query, sort })} />
        </div>
      </Browse>
    </div>
  )
}

const CONN_SORTS = [['status', 'Failing first'], ['service', 'Service'], ['name', 'Name']] as const

const PROJECT_TABS = [['connections', 'Connections'], ['members', 'Members']] as const

export function ProjectView({ project, cache, members, userSearch, pinned, pin, openProject, openFailed, fs, ...c }: {
  project: ProjectRef; cache?: ProjectConnections; fs?: FailedSyncs; members?: ProjectMembers; userSearch?: UserSearch
  pinned: boolean; pin: (p: Project) => void; openProject: (p: ProjectRef) => void; openFailed: OpenFailed
} & Common) {
  const [tab, setTab] = useState<'connections' | 'members'>('connections')
  const full = project.status !== undefined
  // Same source as the cards: a complete FAIL list from Sync requests beats the cached project row's count.
  const failed = fs && !fs.error && !fs.truncated ? fs.rows.filter(r => r.projectId === project.id).length : project.failed
  return (
    <div className="pane">
      <div className="proj-head">
        <div>
          <p className="muted mono">{[project.plan, project.status, project.id.slice(0, 8)].filter(Boolean).join(' · ')}</p>
          {full && <p className="status-counts"><span>{project.connections} connections</span>{!!failed && <span data-tone="fail">{failed} FAIL</span>}</p>}
        </div>
        {full && <button className="icon-btn pin" aria-pressed={pinned} aria-label={pinned ? 'Unpin project' : 'Pin project'} title={pinned ? 'Unpin' : 'Pin to top'} onClick={() => pin(project as Project)}><Icon d="pin" /></button>}
        <OpenInRefit url={projectUrl(project.id)} />
      </div>
      <Segmented label="Project section" value={tab} options={PROJECT_TABS} onChange={setTab} />
      {tab === 'members'
        ? <MembersPanel projectId={project.id} projectName={project.name} members={members?.[project.id]} search={userSearch} {...c} />
        : <ConnectionsPanel key={project.id} page={cache?.[project.id]} command="project-connections" extra={{ project: project.id }}
            none="This project has no data sources yet." openFailed={openFailed} fs={fs} {...c} />}
    </div>
  )
}

// A searchable, sortable connection list from one id-scoped command: a project's (project-connections) or a fitting
// room's (fitting-room-connections). Both return the same columns. Key it by that id so the search state resets.
export function ConnectionsPanel({ page, command, extra, none, openFailed, fs, ...c }: {
  page?: Page<ProjectConnection, ConnectionsQuery>; command: Command; extra: Args; none: string; openFailed: OpenFailed; fs?: FailedSyncs
} & Common) {
  const [query, setQuery] = useState<ConnectionsQuery>(() => page?.query ?? { q: '', sort: 'status' })
  const b = useBrowse({ page, query, command, extra, ...c })
  const [selecting, setSelecting] = useState(false)
  return (
    <>
      <Browse page={page} b={b} run={c.run} now={c.now} command={command} extra={extra} cancel={c.cancel}
        tools={<SelectToggle selecting={selecting} setSelecting={setSelecting} rows={page?.rows} />}
        meta={page?.at ? `${pageCount(page, 'connections')} · updated ${ago(page.at, c.now)}` : ''}
        empty={<Empty icon="search" title={query.q ? 'No matching connections' : 'No connections'} text={query.q ? 'Try other words.' : none} />}
        rowsFor={rows => <ConnectionList rows={rows} now={c.now} groupBy={page?.query.sort === 'service' ? 'service' : undefined} openFailed={openFailed} fs={fs} pageAt={page?.at ?? 0} selecting={selecting} setSelecting={setSelecting} />}>
        <SearchBox value={query.q} onChange={q => setQuery({ ...query, q })} placeholder="Filter connections by name or platform" />
        <div className="filters">
          <Segmented label="Sort connections" value={query.sort} options={CONN_SORTS} onChange={sort => setQuery({ ...query, sort })} />
        </div>
      </Browse>
    </>
  )
}
