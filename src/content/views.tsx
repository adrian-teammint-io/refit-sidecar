// Drawer views. Home lists the commands; each command opens its own view. All data comes from storage (useStore).
// Browse views fetch in batches of BATCH: typing re-queries the server (debounced), "Load more" fetches the next batch.
import { useState } from 'react'
import { call, MAX_TABS, type Run } from '../api'
import { ago } from '../term'
import { dateRange, platform, connectionUrl, projectUrl, fittingRoomUrl, liveFails, type FailedSyncs } from '../failed-syncs'
import {
  pinnedFor, type Project, type ProjectConnection, type ConnectionHit, type FittingRoom, type Pins,
  type Projects, type ProjectConnections, type Connections, type FittingRooms, type ProjectsQuery, type ConnectionsQuery,
  type ProjectMembers, type UserSearch,
} from '../projects'
import { Icon, type IconName } from '../shared/icons'
import { Segmented } from '../shared/controls'
import { MembersPanel } from './members'
import { Browse, Empty, SearchBox, useBrowse, type Exec } from './browse'
export type { Exec } from './browse'
export type Common = { run?: Run; now: number; ready: boolean; exec: Exec; cancel: () => void }
export type OpenFailed = (c: Pick<ProjectConnection, 'connectionId' | 'name'>) => void
type ProjectRef = Pick<Project, 'id' | 'name'> & Partial<Project>

// ---------- Home: the command list ----------

function CommandRow({ icon, title, sub, count, onClick }: { icon: IconName; title: string; sub: string; count?: number; onClick: () => void }) {
  return (
    <button className="cmd-row" onClick={onClick} data-tone={count ? 'fail' : undefined}>
      <span className="cmd-icon"><Icon d={icon} size={18} /></span>
      <span className="cmd-text"><strong>{title}</strong><span className="muted">{sub}</span></span>
      {!!count && <span className="count-chip">{count}</span>}
      <Icon d="chevron" />
    </button>
  )
}

export type HomeTarget = 'projects' | 'connections' | 'fitting' | 'failed'

export function Home({ pins, failedSyncs: fs, now, open, openProject }: {
  pins?: Pins; failedSyncs?: FailedSyncs; now: number; open: (v: HomeTarget) => void; openProject: (p: ProjectRef) => void
}) {
  const n = fs?.rows.length ?? 0
  const pinned = pinnedFor(pins ?? {}, '', 'all')
  return (
    <div className="pane">
      <p className="eyebrow">Search</p>
      <div className="cmd-list">
        <CommandRow icon="folder" title="Projects" onClick={() => open('projects')} sub="Search, sort and pin projects; open one for its connections" />
        <CommandRow icon="plug" title="Connections" onClick={() => open('connections')} sub="Find a data source in any project by name, platform or id" />
        <CommandRow icon="flow" title="Fitting rooms" onClick={() => open('fitting')} sub="Find a pipeline by name or project; newest edits first" />
      </div>
      <p className="eyebrow">Checks</p>
      <div className="cmd-list">
        <CommandRow icon="alert" title="Sync requests" count={n} onClick={() => open('failed')}
          sub={fs?.at ? `${n} failed · updated ${ago(fs.at, now)}` : 'FAIL, IN_PROGRESS and FRAGMENTED sync_requests'} />
      </div>
      {!!pinned.length && <>
        <p className="eyebrow">Pinned projects</p>
        <ul className="proj-list">{pinned.map(p => (
          <li key={p.id}><button className="proj" onClick={() => openProject(p)}><Icon d="pin" size={14} /><span className="proj-main"><strong>{p.name}</strong></span>{p.failed > 0 && <span className="count-chip">{p.failed}</span>}<Icon d="chevron" /></button></li>
        ))}</ul>
      </>}
    </div>
  )
}

// ---------- Projects ----------

const STATUSES = [['all', 'All'], ['ACTIVE', 'Active'], ['PAUSED', 'Paused']] as const
const PROJECT_SORTS = [['active', 'Active first'], ['name', 'Name'], ['recent', 'Recent sync']] as const

function ProjectRow({ p, now, pinned, onOpen, onPin }: { p: Project; now: number; pinned: boolean; onOpen: () => void; onPin: () => void }) {
  return (
    <li className="proj-row">
      <button className="proj" onClick={onOpen} data-paused={p.status === 'PAUSED'}>
        <span className="proj-main">
          <strong title={p.name}>{p.name}</strong>
          <span className="muted mono">{p.connections} conn{p.connections === 1 ? '' : 's'} · {p.lastSync ? `synced ${ago(Date.parse(p.lastSync), now)}` : 'never synced'}</span>
        </span>
        {p.failed > 0 && <span className="count-chip" title={`${p.failed} FAIL sync_requests`}>{p.failed}</span>}
        {p.plan && <span className="badge">{p.plan}</span>}
        {p.status === 'PAUSED' && <span className="badge muted-badge">PAUSED</span>}
        <Icon d="chevron" />
      </button>
      <button className="icon-btn sm pin" aria-pressed={pinned} aria-label={pinned ? `Unpin ${p.name}` : `Pin ${p.name}`} title={pinned ? 'Unpin' : 'Pin to top'} onClick={onPin}>
        <Icon d="pin" size={14} />
      </button>
    </li>
  )
}

export function ProjectsView({ projects, pins, query, setQuery, openProject, pin, ...c }: {
  projects?: Projects; pins?: Pins; query: ProjectsQuery; setQuery: (q: ProjectsQuery) => void
  openProject: (p: ProjectRef) => void; pin: (p: Project) => void
} & Common) {
  const b = useBrowse({ page: projects, query, command: 'projects', ...c })
  const pinned = pinnedFor(pins ?? {}, query.q, query.status)
  const pinnedIds = new Set(Object.keys(pins ?? {}))
  const row = (p: Project) => <ProjectRow key={p.id} p={p} now={c.now} pinned={pinnedIds.has(p.id)} onOpen={() => openProject(p)} onPin={() => pin(p)} />
  return (
    <div className="pane">
      <Browse page={projects} b={b} run={c.run} now={c.now} command="projects" cancel={c.cancel}
        meta={projects?.at ? `${projects.rows.length}${projects.hasMore ? '+' : ''} projects · updated ${ago(projects.at, c.now)}` : ''}
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

// ---------- One project: its connections ----------

const TONE: Record<string, string> = { SUCCESS: 'ok', FAIL: 'fail' }
const CONN_SORTS = [['status', 'Failing first'], ['service', 'Service'], ['name', 'Name']] as const

const PROJECT_TABS = [['connections', 'Connections'], ['members', 'Members']] as const

export function ProjectView({ project, cache, members, userSearch, pinned, pin, openProject, openFailed, fs, ...c }: {
  project: ProjectRef; cache?: ProjectConnections; fs?: FailedSyncs; members?: ProjectMembers; userSearch?: UserSearch
  pinned: boolean; pin: (p: Project) => void; openProject: (p: ProjectRef) => void; openFailed: OpenFailed
} & Common) {
  const [tab, setTab] = useState<'connections' | 'members'>('connections')
  const url = projectUrl(project.id)
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
        {url && <a className="btn primary sm" href={url} target="_top"><Icon d="external" size={13} />Open in Refit</a>}
      </div>
      <Segmented label="Project section" value={tab} options={PROJECT_TABS} onChange={setTab} />
      {tab === 'members'
        ? <MembersPanel projectId={project.id} projectName={project.name} members={members?.[project.id]} search={userSearch} {...c} />
        : <ProjectConnectionsPanel project={project} cache={cache} openFailed={openFailed} fs={fs} {...c} />}
    </div>
  )
}

function ProjectConnectionsPanel({ project, cache, openFailed, fs, ...c }: { project: ProjectRef; cache?: ProjectConnections; openFailed: OpenFailed; fs?: FailedSyncs } & Common) {
  const [query, setQuery] = useState<ConnectionsQuery>(() => cache?.[project.id]?.query ?? { q: '', sort: 'status' })
  const page = cache?.[project.id]
  const extra = { project: project.id }
  const b = useBrowse({ page, query, command: 'project-connections', extra, ...c })
  return (
    <>
      <Browse page={page} b={b} run={c.run} now={c.now} command="project-connections" extra={extra} cancel={c.cancel}
        meta={page?.at ? `${page.rows.length}${page.hasMore ? '+' : ''} connections · updated ${ago(page.at, c.now)}` : ''}
        empty={<Empty icon="search" title={query.q ? 'No matching connections' : 'No connections'} text={query.q ? 'Try other words.' : 'This project has no data sources yet.'} />}
        rowsFor={rows => <ConnectionList rows={rows} now={c.now} groupBy={page?.query.sort === 'service' ? 'service' : undefined} openFailed={openFailed} fs={fs} pageAt={page?.at ?? 0} />}>
        <SearchBox value={query.q} onChange={q => setQuery({ ...query, q })} placeholder="Filter connections by name or platform" />
        <div className="filters">
          <Segmented label="Sort connections" value={query.sort} options={CONN_SORTS} onChange={sort => setQuery({ ...query, sort })} />
        </div>
      </Browse>
    </>
  )
}

// Connection cards. groupBy=service adds a header whenever the platform changes (rows arrive sorted by it).
// Select mode (same UX as Failed syncs) opens the chosen connections' Refit pages in background tabs: deleting a
// connection happens there, in Refit's own dialog, which checks fitting rooms and drops the connection's data table
// and seed view. A plain DELETE here would leave those behind (see AGENTS.md).
function ConnectionList({ rows, now, groupBy, openProject, openFailed, fs, pageAt }: {
  rows: (ProjectConnection & { project?: string })[]; now: number; groupBy?: 'service'; openProject?: (p: ProjectRef) => void; openFailed: OpenFailed
  fs?: FailedSyncs; pageAt: number // the Sync requests FAIL list and this page's fetch time, for liveFails
}) {
  const [open, setOpen] = useState<string>()
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [err, setErr] = useState('')
  const selectable = rows.filter(c => connectionUrl(c))
  const selected = selectable.filter(c => picked.has(c.connectionId))
  const toggle = (id: string) => setPicked(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s })
  const exit = () => { setSelecting(false); setPicked(new Set()); setErr('') }
  const allOn = !!selectable.length && selected.length === Math.min(selectable.length, MAX_TABS)
  const openAll = () => call({ type: 'openTabs', urls: selected.map(c => connectionUrl(c)!) }).then(exit, e => setErr((e as Error).message))
  return <>
    <div className="list-tools">
      <span className="muted">{selecting ? 'Pick connections to open in Refit (delete them there)' : ''}</span>
      <span className="spacer" />
      {selecting
        ? <button className="btn ghost sm" onClick={exit}>Done</button>
        : !!selectable.length && <button className="btn ghost sm" onClick={() => setSelecting(true)}><Icon d="check" size={13} />Select</button>}
    </div>
    <ul className="syncs" data-selecting={selecting}>
      {rows.map((c, i) => {
        const url = connectionUrl(c)
        const { failed, reason } = liveFails(c, pageAt, fs)
        const expanded = open === c.connectionId
        const header = groupBy && (i === 0 || platform(rows[i - 1]) !== platform(c))
        const on = picked.has(c.connectionId)
        const pick = selecting && url ? (e: React.MouseEvent) => { if (!(e.target as Element).closest('a, button')) toggle(c.connectionId) } : undefined
        return (
          <li key={c.connectionId} className="conn-item" style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
            {header && <p className="eyebrow group-head">{platform(c)}</p>}
            <div className="sync conn" data-status={c.status ?? 'NEVER'} data-selected={selecting && on} onClick={pick}>
              <div className="sync-head">
                {selecting && url && (
                  <button className="check" role="checkbox" aria-checked={on} aria-label={`Select ${c.name}`} onClick={() => toggle(c.connectionId)}><Icon d="check" size={12} /></button>
                )}
                <span className="badge">{platform(c)}</span>
                <strong title={c.name}>{c.name.trim()}</strong>
                <span className="pill" data-tone={c.status ? TONE[c.status] ?? 'none' : 'none'}>{c.status ?? 'never synced'}</span>
                {url && !selecting && <a className="icon-btn sync-link" href={url} target="_top" aria-label={`Open ${c.name} on Refit`} title="Open connection"><Icon d="external" size={14} /></a>}
              </div>
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
        <div className="bulk-row">
          <span className="bulk-count"><b>{selected.length}</b> selected</span>
          <button className="link-btn" onClick={() => setPicked(allOn ? new Set() : new Set(selectable.slice(0, MAX_TABS).map(c => c.connectionId)))}>
            {allOn ? 'Clear' : selectable.length > MAX_TABS ? `Select first ${MAX_TABS}` : `Select all ${selectable.length}`}
          </button>
          <span className="spacer" />
          <button className="btn primary sm" disabled={!selected.length || selected.length > MAX_TABS} onClick={openAll}>
            <Icon d="external" size={13} />Open {selected.length || ''} in Refit
          </button>
        </div>
        <p className="bulk-note muted">
          {err || (selected.length > MAX_TABS ? `At most ${MAX_TABS} tabs at once.` : 'Opens each in a background tab. Delete it there: Refit checks fitting rooms and removes its data table.')}
        </p>
      </div>
    )}
  </>
}

// ---------- Connections search (all projects) ----------

export function ConnectionsView({ page, query, setQuery, openProject, openFailed, fs, ...c }: {
  page?: Connections; fs?: FailedSyncs; query: { q: string }; setQuery: (q: { q: string }) => void; openProject: (p: ProjectRef) => void; openFailed: OpenFailed
} & Common) {
  const b = useBrowse({ page, query, command: 'connections', ...c })
  return (
    <div className="pane">
      <Browse page={page} b={b} run={c.run} now={c.now} command="connections" cancel={c.cancel}
        meta={page?.at ? `${page.rows.length}${page.hasMore ? '+' : ''} connections${page.query.q ? ` matching "${page.query.q}"` : ''}` : ''}
        empty={<Empty icon="search" title="No matching connections" text="Search matches connection name, platform (META, TIKTOK…) or id." />}
        rowsFor={rows => <ConnectionList rows={rows as ConnectionHit[]} now={c.now} openProject={openProject} openFailed={openFailed} fs={fs} pageAt={page?.at ?? 0} />}>
        <SearchBox value={query.q} onChange={q => setQuery({ q })} placeholder="Search connections in every project" autoFocus />
      </Browse>
    </div>
  )
}

// ---------- Fitting rooms search ----------

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
                <li key={r.id} className="sync" style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
                  <div className="sync-head">
                    <span className="badge">{r.nodes} node{r.nodes === 1 ? '' : 's'}</span>
                    <strong title={r.name}>{r.name}</strong>
                    {r.notOk > 0 && <span className="pill" data-tone="fail" title="fitdata syncs not in SUCCESS">{r.notOk} not ok</span>}
                    {url && <a className="icon-btn sync-link" href={url} target="_top" aria-label={`Open ${r.name} in Refit`} title="Open fitting room"><Icon d="external" size={14} /></a>}
                  </div>
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
