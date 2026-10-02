// New project (create-project): like refit-gql add_project, but you choose the owner (create_by, admin), any
// extra members with roles (hoan@team-mint.io pre-filled, removable), plan, status and end date. One statement,
// approved in Tabularis. On success it opens the new project.
import { useEffect, useRef, useState } from 'react'
import { ENV } from '../table'
import { NO_PROJECT, PLANS, PROJECT_STATUSES, ROLES, toHex, type Role, type UserHit, type UserSearch } from '../projects'
import { Icon } from '../shared/icons'
import { Segmented } from '../shared/controls'
import { commandState } from './browse'
import { WriteConfirm } from './ui'
import { UserPicker } from './members'
import type { Common } from './views'

const DEFAULT_MEMBER = 'hoan@team-mint.io' // pre-filled member (Hoàn), removable
const MAX_MEMBERS = 50 // the members param takes at most 50
const label = (s: string) => s[0] + s.slice(1).toLowerCase().replace('_', ' ')
const PLAN_OPTIONS = PLANS.map(p => [p, label(p)] as const)
const STATUS_OPTIONS = PROJECT_STATUSES.map(s => [s, label(s)] as const)
const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const inAMonth = () => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() + 1); return isoDay(d) }

type Member = { user: UserHit; role: Role }

function Person({ u, children }: { u: UserHit; children?: React.ReactNode }) {
  return (
    <div className="person">
      <span className="avatar" aria-hidden>{(u.name || u.email)[0].toUpperCase()}</span>
      <span className="member-main"><strong title={u.email}>{u.email}</strong><span className="muted">{u.name ?? 'No name'}</span></span>
      {children}
    </div>
  )
}

export function NewProjectView({ search, run, ready, exec, onCreated }: { search?: UserSearch; onCreated: (p: { id: string; name: string }) => void } & Common) {
  const [name, setName] = useState('')
  const [owner, setOwner] = useState<UserHit>()
  const [members, setMembers] = useState<Member[]>([])
  const [plan, setPlan] = useState<(typeof PLANS)[number]>('BASIC')
  const [status, setStatus] = useState<(typeof PROJECT_STATUSES)[number]>('PAUSED')
  const [end, setEnd] = useState(inAMonth)
  const [picking, setPicking] = useState<'owner' | 'member'>()

  const [defaulted, setDefaulted] = useState(false)

  // Pre-fill the default member: look the email up once, then add the exact match as admin. Only a search newer
  // than the one stored when the view opened counts; if a typed search replaced the lookup, give up quietly.
  const openedWith = useRef(search?.runId)
  useEffect(() => { if (ready && !defaulted) exec('user-search', { env: ENV, project: NO_PROJECT, q: toHex(DEFAULT_MEMBER) }) }, [ready])
  useEffect(() => {
    if (defaulted || !search || search.runId === openedWith.current || search.project !== NO_PROJECT) return
    setDefaulted(true)
    if (search.q !== DEFAULT_MEMBER) return
    const me = search.rows.find(u => u.email.toLowerCase() === DEFAULT_MEMBER)
    if (me) setMembers(m => (m.some(x => x.user.id === me.id) ? m : [{ user: me, role: 'admin' }, ...m]))
  }, [search?.runId])

  const { mine: creating, busy, last, ok: created } = commandState(run, 'create-project')
  useEffect(() => { if (created && last!.result?.projectId) onCreated({ id: last!.result.projectId, name: last!.result.name }) }, [last?.id])

  const trimmed = name.trim()
  const extras = members.filter(m => m.user.id !== owner?.id) // the owner is always admin
  const today = isoDay(new Date())
  const problems = [
    !trimmed && 'Name the project.',
    new TextEncoder().encode(trimmed).length > 200 && 'Name is longer than 200 bytes.',
    !owner && 'Pick an owner.',
    !/^\d{4}-\d{2}-\d{2}$/.test(end) && 'Pick an end date.',
    extras.length > MAX_MEMBERS && `At most ${MAX_MEMBERS} members.`,
  ].filter(Boolean) as string[]
  const create = () => owner && exec('create-project', {
    env: ENV, name: toHex(trimmed), user: owner.id, status, plan, end, members: extras.map(m => `${m.user.id}:${m.role}`).join(','),
  })
  const chosen = new Set([owner?.id, ...members.map(m => m.user.id)].filter(Boolean) as string[])

  return (
    <div className="pane np">
      <section className="field">
        <label className="eyebrow" htmlFor="np-name">Name</label>
        <input id="np-name" className="text-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sample Brand KR" maxLength={120} autoFocus spellCheck={false} />
      </section>

      <section className="field">
        <p className="eyebrow">Owner <span className="eyebrow-note">create_by · admin</span></p>
        {owner && picking !== 'owner'
          ? <Person u={owner}><button className="link-btn" onClick={() => setPicking('owner')}>Change</button></Person>
          : picking === 'owner'
            ? <div className="pick-box"><UserPicker projectId={NO_PROJECT} search={search} run={run} ready={ready} exec={exec} placeholder="Search the owner by email or name"
                onPick={u => { setOwner(u); setPicking(undefined) }} /></div>
            : <button className="btn ghost pick-btn" onClick={() => setPicking('owner')}><Icon d="search" size={14} />Pick an owner</button>}
      </section>

      <section className="field">
        <p className="eyebrow">Members <span className="eyebrow-note">{extras.length} besides the owner</span></p>
        {!!members.length && (
          <ul className="member-list">
            {members.map(m => (
              <li key={m.user.id}>
                <Person u={m.user}>
                  {m.user.id === owner?.id ? <span className="role" data-role="admin">owner</span> : (
                    <select className="role-select" value={m.role} aria-label={`Role for ${m.user.email}`}
                      onChange={e => setMembers(ms => ms.map(x => (x.user.id === m.user.id ? { ...x, role: e.target.value as Role } : x)))}>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  )}
                  <button className="icon-btn sm" aria-label={`Remove ${m.user.email}`} title="Remove" onClick={() => setMembers(ms => ms.filter(x => x.user.id !== m.user.id))}><Icon d="x" size={14} /></button>
                </Person>
              </li>
            ))}
          </ul>
        )}
        {picking === 'member'
          ? <div className="pick-box">
              <UserPicker projectId={NO_PROJECT} search={search} run={run} ready={ready} exec={exec} skip={chosen} placeholder="Add a member by email or name"
                onPick={u => { setMembers(ms => [...ms, { user: u, role: 'admin' }]); setPicking(undefined) }} />
              <button className="link-btn" onClick={() => setPicking(undefined)}>Done</button>
            </div>
          : <button className="btn ghost pick-btn" onClick={() => setPicking('member')}><Icon d="plus" size={14} />Add member</button>}
        {!defaulted && <p className="hint muted">Looking up {DEFAULT_MEMBER}…</p>}
      </section>

      <section className="field">
        <p className="eyebrow">Plan</p>
        <Segmented label="Plan" value={plan} options={PLAN_OPTIONS} onChange={setPlan} />
      </section>

      <section className="field">
        <p className="eyebrow">Status</p>
        <Segmented label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
      </section>

      <section className="field">
        <label className="eyebrow" htmlFor="np-end">End date</label>
        <input id="np-end" type="date" className="text-input date" value={end} onChange={e => setEnd(e.target.value)} />
        {status === 'ACTIVE' && end <= today && <p className="hint fail-text">ACTIVE with an end date of today or earlier gets picked up by billing / expiry right away.</p>}
      </section>

      <div className="bulk np-confirm" data-open="true">
        <WriteConfirm waiting={creating} busy={busy} typeWord={problems.length ? undefined : trimmed} typeLabel="Type the name"
          title={<strong>{trimmed ? `Create "${trimmed}"` : 'Create project'}</strong>}
          note={problems.length ? problems.join(' ')
            : `${plan} · ${status} · ends ${end} · owner ${owner!.email} + ${extras.length} member${extras.length === 1 ? '' : 's'}. Approve it in Tabularis when asked.`}
          action={{ label: <><Icon d="plus" size={13} />Create project</>, disabled: !!problems.length, onClick: create }} />
      </div>
    </div>
  )
}
