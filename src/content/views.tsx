// Drawer views. Home lists the commands; each command opens its own view. All data comes from storage (useStore).
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Args, Command, Run } from '../api'
import { ago, runStatus } from '../term'
import { dateRange, platform, connectionUrl, projectUrl, type FailedSyncs } from '../failed-syncs'
import { searchProjects, type Project, type ProjectConnection, type ProjectConnections, type Projects } from '../projects'
import { isRunning } from '../shared/store'
import { Icon, type IconName } from '../shared/icons'
import { Segmented } from '../shared/controls'
import { SyncList } from '../shared/SyncList'

export type Exec = (command: Command, args?: Args) => void
const runningThis = (run: Run | undefined, command: Command, args?: Args) =>
  isRunning(run) && run!.command === command && (!args?.project || run!.args?.project === args.project)

// ---------- Home: the command list ----------

function CommandRow({ icon, title, sub, count, onClick }: { icon: IconName; title: string; sub: string; count?: number; onClick: () => void }) {
  return (
    <button className="cmd-row" onClick={onClick}>
      <span className="cmd-icon"><Icon d={icon} size={18} /></span>
      <span className="cmd-text"><strong>{title}</strong><span className="muted">{sub}</span></span>
      {!!count && <span className="count-chip">{count}</span>}
      <Icon d="chevron" />
    </button>
  )
}

export function Home({ projects, failedSyncs: fs, now, open }: { projects?: Projects; failedSyncs?: FailedSyncs; now: number; open: (v: 'projects' | 'failed') => void }) {
  const n = fs?.rows.length ?? 0
  return (
    <div className="pane">
      <p className="eyebrow">Commands</p>
      <div className="cmd-list">
        <CommandRow icon="search" title="Projects" onClick={() => open('projects')}
          sub={projects?.at ? `${projects.rows.length} projects · updated ${ago(projects.at, now)}` : 'Search and browse every project and its connections'} />
        <CommandRow icon="alert" title="Failed syncs" count={n} onClick={() => open('failed')}
          sub={fs?.at ? `${n} failed · updated ${ago(fs.at, now)}` : 'Fetch every sync_request with status FAIL'} />
      </div>
      <p className="hint muted">Each command runs in your <code>pnpm server</code> terminal against prod (read-only, through Tabularis).</p>
    </div>
  )
}

// ---------- shared bits ----------

function RunBar({ run, now, command, args, label, onRun, onCancel, meta }: {
  run?: Run; now: number; command: Command; args?: Args; label: string; onRun: () => void; onCancel: () => void; meta: string
}) {
  const mine = runningThis(run, command, args)
  const busy = isRunning(run) && !mine
  const st = run && !isRunning(run) && run.command === command && (!args?.project || run.args?.project === args.project) ? runStatus(run, now) : undefined
  return (
    <div className="runbar">
      <span className="muted">{mine ? `Running ${command}…` : busy ? `Waiting: ${run!.command} is running` : meta}</span>
      <span className="spacer" />
      {st && <span className="pill" data-tone={st.tone} title={st.label}>{st.label}</span>}
      {mine
        ? <button className="btn ghost sm" onClick={onCancel}><Icon d="stop" size={13} />Cancel</button>
        : <button className="btn primary sm" onClick={onRun} disabled={busy}><Icon d="play" size={13} />{label}</button>}
    </div>
  )
}

function ErrorBanner({ error, hasRows, onOutput }: { error?: string; hasRows: boolean; onOutput: () => void }) {
  if (!error) return null
  return (
    <div className="banner" role="alert">
      <Icon d="alert" />
      <span>{hasRows ? 'Showing the last good result. ' : ''}{error}</span>
      <button className="btn ghost" onClick={onOutput}>Output</button>
    </div>
  )
}

function Empty({ icon, title, text }: { icon: IconName; title: string; text: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon d={icon} size={22} /></div>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  )
}

const Skeleton = ({ rows = 6 }: { rows?: number }) => (
  <div className="skeleton-list" aria-busy="true">{Array.from({ length: rows }, (_, i) => <div key={i} className="skel" style={{ '--i': i } as React.CSSProperties} />)}</div>
)

function SearchBox({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus) ref.current?.focus() }, [])
  return (
    <label className="search">
      <Icon d="search" />
      <input ref={ref} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        onKeyDown={e => { if (e.key === 'Escape' && value) { e.stopPropagation(); onChange('') } }} />
      {value && <button className="icon-btn sm" aria-label="Clear search" title="Clear" onClick={() => onChange('')}><Icon d="x" size={14} /></button>}
    </label>
  )
}

// ---------- Failed syncs ----------

export function FailedView({ fs, run, now, exec, cancel, showOutput }: {
  fs?: FailedSyncs; run?: Run; now: number; exec: Exec; cancel: () => void; showOutput: () => void
}) {
  const n = fs?.rows.length ?? 0
  return (
    <div className="pane">
      <RunBar run={run} now={now} command="failed-syncs" label="Fetch FAIL syncs" onRun={() => exec('failed-syncs')} onCancel={cancel}
        meta={fs?.at ? `${n} failed · updated ${ago(fs.at, now)}` : 'Not fetched yet'} />
      <ErrorBanner error={fs?.error} hasRows={!!n} onOutput={showOutput} />
      {!fs ? (runningThis(run, 'failed-syncs') ? <Skeleton rows={3} /> : <Empty icon="terminal" title="No results yet" text={<><b>Fetch FAIL syncs</b> runs <code>failed-syncs</code> in your <code>pnpm server</code> terminal and lists every prod sync_request with status FAIL.</>} />)
        : !n && !fs.error ? <Empty icon="check" title="No failed syncs" text="No sync_request on prod has status FAIL." />
        : <>
            <SyncList rows={fs.rows} now={now} />
            {fs.truncated && <p className="hint muted center">Showing the newest {n}. Older failures were cut by the query limit.</p>}
          </>}
    </div>
  )
}

// ---------- Projects: search + list ----------

export type ProjectFilter = { q: string; status: 'all' | 'ACTIVE' | 'PAUSED' }
const STATUSES = [['all', 'All'], ['ACTIVE', 'Active'], ['PAUSED', 'Paused']] as const

export function ProjectsView({ projects, run, now, ready, exec, cancel, showOutput, filter, setFilter, openProject }: {
  projects?: Projects; run?: Run; now: number; ready: boolean; exec: Exec; cancel: () => void; showOutput: () => void
  filter: ProjectFilter; setFilter: (f: ProjectFilter) => void; openProject: (p: Project) => void
}) {
  // Auto-load once; afterwards the cached list shows instantly and the refresh button re-fetches.
  useEffect(() => { if (ready && !projects && !isRunning(run)) exec('projects') }, [ready, isRunning(run)]) // also retries once a busy run ends
  const rows = projects?.rows ?? []
  const shown = useMemo(() => searchProjects(rows, filter.q, filter.status), [rows, filter.q, filter.status])
  return (
    <div className="pane">
      <SearchBox value={filter.q} onChange={q => setFilter({ ...filter, q })} placeholder="Search projects by name, id or plan" autoFocus />
      <div className="filters">
        <Segmented label="Status" value={filter.status} options={STATUSES} onChange={status => setFilter({ ...filter, status })} />
      </div>
      <RunBar run={run} now={now} command="projects" label="Refresh" onRun={() => exec('projects')} onCancel={cancel}
        meta={projects?.at ? `${shown.length} of ${rows.length} · updated ${ago(projects.at, now)}` : 'Loading projects…'} />
      <ErrorBanner error={projects?.error} hasRows={!!rows.length} onOutput={showOutput} />
      {!projects ? <Skeleton /> : !shown.length ? (
        <Empty icon="search" title={rows.length ? 'No matching projects' : 'No projects'} text={rows.length ? 'Try fewer words, or another status.' : 'The query returned no projects.'} />
      ) : (
        <ul className="proj-list">
          {shown.map((p, i) => (
            <li key={p.id} style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
              <button className="proj" onClick={() => openProject(p)} data-paused={p.status === 'PAUSED'}>
                <span className="proj-main">
                  <strong title={p.name}>{p.name}</strong>
                  <span className="muted mono">{p.connections} conn{p.connections === 1 ? '' : 's'} · {p.lastSync ? `synced ${ago(Date.parse(p.lastSync), now)}` : 'never synced'}</span>
                </span>
                {p.failed > 0 && <span className="count-chip" title={`${p.failed} FAIL sync_requests`}>{p.failed}</span>}
                {p.plan && <span className="badge">{p.plan}</span>}
                {p.status === 'PAUSED' && <span className="badge muted-badge">PAUSED</span>}
                <Icon d="chevron" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------- One project: its connections ----------

const TONE: Record<string, string> = { SUCCESS: 'ok', FAIL: 'fail' }

export function ProjectView({ project, cache, run, now, ready, exec, cancel, showOutput }: {
  project: Pick<Project, 'id' | 'name'> & Partial<Project>; cache?: ProjectConnections; run?: Run; now: number; ready: boolean
  exec: Exec; cancel: () => void; showOutput: () => void
}) {
  const entry = cache?.[project.id]
  const args = { project: project.id }
  useEffect(() => { if (ready && !entry && !isRunning(run)) exec('project-connections', args) }, [ready, project.id, isRunning(run)])
  const [q, setQ] = useState('')
  const rows = entry?.rows ?? []
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = rows.filter(c => words.every(w => `${c.name} ${c.service ?? c.kind} ${c.status ?? ''}`.toLowerCase().includes(w)))
  const byStatus = Object.entries(rows.reduce<Record<string, number>>((m, c) => ({ ...m, [c.status ?? 'NEVER']: (m[c.status ?? 'NEVER'] ?? 0) + 1 }), {}))
    .sort((a, b) => (a[0] === 'FAIL' ? -1 : b[0] === 'FAIL' ? 1 : b[1] - a[1]))
  const url = projectUrl(project.id)

  return (
    <div className="pane">
      <div className="proj-head">
        <div>
          <p className="muted mono">{[project.plan, project.status, project.id.slice(0, 8)].filter(Boolean).join(' · ')}</p>
          {!!byStatus.length && (
            <p className="status-counts">{byStatus.map(([s, n]) => <span key={s} data-tone={TONE[s] ?? 'none'}>{n} {s.toLowerCase()}</span>)}</p>
          )}
        </div>
        {url && <a className="btn primary sm" href={url} target="_top"><Icon d="external" size={13} />Open in Refit</a>}
      </div>
      {rows.length > 6 && <SearchBox value={q} onChange={setQ} placeholder="Filter connections" />}
      <RunBar run={run} now={now} command="project-connections" args={args} label="Refresh" onRun={() => exec('project-connections', args)} onCancel={cancel}
        meta={entry?.at ? `${shown.length} of ${rows.length} connections · updated ${ago(entry.at, now)}` : 'Loading connections…'} />
      <ErrorBanner error={entry?.error} hasRows={!!rows.length} onOutput={showOutput} />
      {!entry ? <Skeleton rows={5} /> : !shown.length
        ? <Empty icon="search" title={rows.length ? 'No matching connections' : 'No connections'} text={rows.length ? 'Try other words.' : 'This project has no data sources yet.'} />
        : <ConnectionList rows={shown} now={now} />}
    </div>
  )
}

function ConnectionList({ rows, now }: { rows: ProjectConnection[]; now: number }) {
  const [open, setOpen] = useState<string>()
  return (
    <ul className="syncs">
      {rows.map((c, i) => {
        const url = connectionUrl(c)
        const reason = c.displayReason ?? c.reason
        const expanded = open === c.connectionId
        return (
          <li key={c.connectionId} className="sync conn" data-status={c.status ?? 'NEVER'} style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
            <div className="sync-head">
              <span className="badge">{platform(c)}</span>
              <strong title={c.name}>{c.name.trim()}</strong>
              <span className="pill" data-tone={c.status ? TONE[c.status] ?? 'none' : 'none'}>{c.status ?? 'never synced'}</span>
              {url && <a className="icon-btn sync-link" href={url} target="_top" aria-label={`Open ${c.name} on Refit`} title="Open connection"><Icon d="external" size={14} /></a>}
            </div>
            <p className="sync-meta muted">
              {c.syncType && <><span className="mono">{c.syncType}</span> · </>}
              {c.lastSync ? `last sync ${ago(Date.parse(c.lastSync), now)}` : 'no sync yet'}
              {(c.start || c.end) && <> · <span className="mono">{dateRange(c)}</span></>}
              {c.failed > 0 && <> · <span className="fail-text">{c.failed} FAIL total</span></>}
            </p>
            {reason && (
              <button className="sync-reason" data-open={expanded} aria-expanded={expanded} onClick={() => setOpen(expanded ? undefined : c.connectionId)}
                title={expanded ? 'Collapse' : 'Show full reason'}>{reason}</button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
