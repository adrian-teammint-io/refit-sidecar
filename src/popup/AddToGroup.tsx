// Popup: the groups list, drawer style (content/groups.tsx GroupList): no groups → Add a group; otherwise one row per
// group, a click adds the current tab's connection (on a Refit connection page) to it. Vault notes, edited through the
// host's groups-edit, on the tab's environment. The name / platform / project come from whatever the drawer has
// cached for that env; unknown, it's added by id alone and the drawer fills the rest in on its next check.
import { useState } from 'react'
import { call, type Args, type Command, type Run } from '../api'
import { plural, runOk, runStatus } from '../term'
import type { Env } from '../table'
import type { ConnectionHit } from '../projects'
import { groupKey, groupList } from '../groups'
import { addOp, editGroups } from '../shared/GroupPicker'
import { Icon } from '../shared/icons'
import type { TabData, TabPage } from './tab'

// The current connection from cached data, newest knowledge first; a stub when the drawer never loaded it.
function known(p: TabPage, d: TabData): ConnectionHit & { stub?: true } {
  const id = p.connectionId
  const project = d.pins?.[p.projectId]?.name ?? d.projects?.rows.find(r => r.id === p.projectId)?.name ?? ''
  const hit = d.connections?.rows.find(r => r.connectionId === id)
    ?? Object.values(d.groups ?? {}).flatMap(g => Object.values(g.conns)).find(c => c.connectionId === id && !c.stub && !c.gone)
  if (hit) return hit
  const row = d.projectConnections?.[p.projectId]?.rows.find(r => r.connectionId === id)
  if (row) return { ...row, project }
  return {
    connectionId: id, projectId: p.projectId, project, name: '', kind: p.kind, service: null, start: null, end: null,
    status: null, syncType: null, lastSync: null, reason: null, displayReason: null, failed: 0, stub: true,
  }
}

export function AddToGroup({ page, env, d, run, ready }: { page?: TabPage; env: Env; d: TabData; run?: Run; ready: boolean }) {
  const [err, setErr] = useState('')
  const [mine, setMine] = useState<string>() // the groups-edit run started here, for its result line
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const conn = page && known(page, d)
  const list = groupList(d.groups ?? {})
  const exec = (command: Command, args?: Args) =>
    call<string>({ type: 'run', command, args }).then(id => { setErr(''); setMine(id) }, e => setErr((e as Error).message))
  const last = run && run.id === mine && run.endedAt ? run : undefined
  const result = err || (last ? (runOk(last) ? last.summary ?? 'Saved' : last.tail ?? runStatus(last, Date.now()).label) : '')
  // A new group starts with the current connection in it (add creates the note); off a connection page, empty.
  const create = () => {
    const to = name.trim()
    if (!to) return
    if (d.groups?.[groupKey(to)]) return setErr('A group with that name exists')
    editGroups(exec, conn ? addOp(to, [conn]) : { op: 'create', name: to }, env)
    setCreating(false); setName('')
  }
  const cancel = () => { setCreating(false); setErr('') }
  return (
    <article className="card p-group">
      {conn && <>
        <p className="eyebrow">This connection · {env === 'stag' ? 'staging' : 'prod'}</p>
        <div className="p-group-conn">
          <span className="badge">{conn.service ?? conn.kind}</span>
          <strong title={conn.name.trim() || conn.connectionId}>{conn.name.trim() || 'Name not loaded yet'}</strong>
        </div>
        <p className="muted mono p-group-id">{conn.project ? `${conn.project} · ` : ''}{conn.connectionId}</p>
      </>}
      <div className="cgroup-list-head">
        <p className="eyebrow">Groups</p>
        {ready && !!list.length && !creating && <button className="link-btn" onClick={() => setCreating(true)}><Icon d="plus" size={12} />New group</button>}
      </div>
      {!ready ? <p className="muted p-group-id">Start <code>pnpm server</code> to edit groups.</p> : <>
        {creating && (
          <form className="cgroup-new" onSubmit={e => { e.preventDefault(); create() }}
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); cancel() } }}>
            <input className="text-input" autoFocus placeholder="Group name, e.g. Craver Meta" aria-label="New group name" value={name}
              onChange={e => { setName(e.target.value); setErr('') }} />
            <button className="btn sm" disabled={!name.trim()}><Icon d="plus" size={13} />Create</button>
            <button type="button" className="btn ghost sm" onClick={cancel}>Cancel</button>
          </form>
        )}
        {!list.length && !creating && (
          <button className="cgroup-empty" onClick={() => setCreating(true)}>
            <Icon d="plus" size={14} />
            <span><strong>Add a group</strong><span className="muted">{conn ? 'Starts with this connection.' : 'Collect connections to check and open together.'}</span></span>
          </button>
        )}
        {!!list.length && <ul className="proj-list p-group-list">
          {list.map(([id, g]) => {
            const on = !!conn && !!g.conns[conn.connectionId]
            return (
              <li key={id}>
                <button className="proj" disabled={!conn || on} onClick={() => conn && editGroups(exec, addOp(g.name, [conn]), env)}
                  title={!conn ? 'Open a Refit connection page to add it' : on ? 'Already in this group' : `Add this connection to ${g.name}`}>
                  <Icon d="plug" size={15} />
                  <span className="proj-main">
                    <strong title={g.name}>{g.name}</strong>
                    <span className="muted mono">{plural(Object.keys(g.conns).length, 'conn')}</span>
                  </span>
                  {conn && <Icon d={on ? 'check' : 'plus'} size={14} />}
                </button>
              </li>
            )
          })}
        </ul>}
      </>}
      {result && <p className={last && !runOk(last) || err ? 'err' : 'muted p-group-id'}>{result}</p>}
    </article>
  )
}
