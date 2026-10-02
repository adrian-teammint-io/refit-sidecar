// A project's members (project-members) and Add user (user-search + add-project-user), like refit-app-2's admin
// ProjectMembersModal. Only existing refit_user rows can be added; someone already in the project is never changed.
import { useEffect, useRef, useState } from 'react'
import { ago } from '../term'
import { ENV } from '../table'
import { ROLES, cleanQuery, toHex, type Members, type Role, type UserHit, type UserSearch } from '../projects'
import { Icon } from '../shared/icons'
import { Segmented } from '../shared/controls'
import { Empty, ErrorBanner, SearchBox, Skeleton, StatusLine, commandState, useDebounced, type Common } from './browse'
import { WriteConfirm } from './ui'
import { UserLabel, stagger } from '../shared/card'


const ROLE_OPTIONS = ROLES.map(r => [r, r[0].toUpperCase() + r.slice(1)] as const)

export function MembersPanel({ projectId, projectName, members, search, ...c }: {
  projectId: string; projectName: string; members?: Members; search?: UserSearch
} & Common) {
  const [adding, setAdding] = useState(false)
  const extra = { project: projectId }
  const load = () => c.exec('project-members', { env: ENV, project: projectId })
  const asked = useRef(false)
  useEffect(() => { if (c.ready && !members && !asked.current) { asked.current = true; load() } }, [c.ready])
  const loading = commandState(c.run, 'project-members', extra).mine
  const n = members?.rows.length ?? 0
  return (
    <div className="members" onKeyDown={e => { if (e.key === 'Escape' && adding) { e.stopPropagation(); setAdding(false) } }}>
      <StatusLine run={c.run} now={c.now} command="project-members" extra={extra} loading={loading} onRefresh={load} onCancel={c.cancel}
        meta={members?.at ? `${n} member${n === 1 ? '' : 's'} · updated ${ago(members.at, c.now)}` : ''} />
      {adding
        ? <AddUser projectId={projectId} projectName={projectName} search={search} onClose={() => setAdding(false)} {...c} />
        : <button className="btn ghost add-user" onClick={() => setAdding(true)}><Icon d="plus" size={14} />Add user</button>}
      <ErrorBanner error={members?.error} hasRows={!!n} />
      {!members ? <Skeleton rows={3} />
        : !n ? <Empty icon="users" title="No members" text="Nobody has access to this project yet." />
        : <ul className="member-list">
            {members.rows.map((m, i) => (
              <li key={m.id} className="member" style={stagger(i)}>
                <UserLabel u={m} sub={`${m.name ?? 'No name'} · added ${ago(Date.parse(m.addedAt), c.now)}`} />
                <span className="role" data-role={m.role}>{m.role}</span>
              </li>
            ))}
          </ul>}
    </div>
  )
}

// Search an existing user by email or name, pick a role, confirm. On prod you type the email's part before @.
function AddUser({ projectId, projectName, search, run, ready, exec, onClose }: {
  projectId: string; projectName: string; search?: UserSearch; onClose: () => void
} & Common) {
  const [picked, setPicked] = useState<UserHit>()
  const [role, setRole] = useState<Role>('viewer')
  const extra = { project: projectId }
  const { mine: saving, busy, last, ok: added } = commandState(run, 'add-project-user', extra)
  // A finished add (added, or already a member): the members list reloads by itself; close the form.
  useEffect(() => { if (added) onClose() }, [last?.id])

  return (
    <div className="add-panel">
      <div className="add-title">
        <strong>Add user</strong>
        <span className="spacer" />
        <button className="icon-btn sm" aria-label="Close add user" title="Close" onClick={onClose}><Icon d="x" size={14} /></button>
      </div>
      {!picked ? <UserPicker projectId={projectId} search={search} run={run} ready={ready} exec={exec} onPick={setPicked} />
      : <>
        <div className="picked">
          <UserLabel u={picked} />
          <button className="link-btn" onClick={() => setPicked(undefined)} disabled={saving}>Change</button>
        </div>
        <Segmented label="Role" value={role} options={ROLE_OPTIONS} onChange={setRole} />
        <WriteConfirm waiting={saving} busy={busy} typeWord={picked.email.split('@')[0]} autoFocus
          title={<span className="add-confirm">Add <b>{picked.email}</b> to <b>{projectName}</b> as <b>{role}</b>?</span>}
          note="Approve it in Tabularis when asked. If they are already a member, nothing changes."
          action={{ label: <><Icon d="plus" size={13} />Add as {role}</>, disabled: !!picked.memberRole,
            onClick: () => exec('add-project-user', { env: ENV, user: picked.id, project: projectId, role }) }} />
      </>}
    </div>
  )
}

// Search existing users by email or name (user-search, debounced) and pick one. Used by Add user and New project.
// `projectId` marks who's already a member (they can't be picked); `skip` hides users already chosen elsewhere.
export function UserPicker({ projectId, search, run, ready, exec, onPick, skip, placeholder = 'Search users by email or name' }: {
  projectId: string; search?: UserSearch; onPick: (u: UserHit) => void; skip?: Set<string>; placeholder?: string
} & Pick<Common, 'run' | 'ready' | 'exec'>) {
  const [q, setQ] = useState('')
  const wanted = useDebounced(cleanQuery(q))
  useEffect(() => { if (ready && wanted.length >= 2) exec('user-search', { env: ENV, project: projectId, q: toHex(wanted) }) }, [wanted, ready])
  const fresh = !!search && search.project === projectId && search.q === wanted
  const searching = commandState(run, 'user-search', { project: projectId }).mine
  const hits = fresh ? search!.rows.filter(u => !skip?.has(u.id)) : []
  return <>
    <SearchBox value={q} onChange={setQ} placeholder={placeholder} autoFocus />
    {wanted.length < 2 ? <p className="hint muted">Type at least 2 characters. Only existing Refit users can be picked.</p>
      : !fresh ? <p className="hint muted">{searching ? 'Searching…' : 'Waiting to search…'}</p>
      : !hits.length ? <p className="hint muted">No {search!.rows.length ? 'other ' : ''}user matches "{wanted}".</p>
      : <ul className="hit-list" data-stale={searching}>
          {hits.map(u => (
            <li key={u.id}>
              <button className="hit" disabled={!!u.memberRole} onClick={() => { onPick(u); setQ('') }}
                title={u.memberRole ? `Already a member as ${u.memberRole}` : `Pick ${u.email}`}>
                <UserLabel u={u} />
                {u.memberRole ? <span className="role" data-role={u.memberRole}>member · {u.memberRole}</span> : <Icon d="plus" size={14} />}
              </button>
            </li>
          ))}
        </ul>}
  </>
}
