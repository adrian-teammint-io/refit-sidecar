// Saved connection groups (src/groups.ts): the list above the Connections search, the Add to group picker (a card's +
// and the Select bar), and one group's view (live status via connection-group, search and add, Remove, Rename,
// Delete, Open all). The groups are Markdown notes in the Obsidian vault; every edit is a groups-edit run
// (host/groups.mjs), whose reply replaces the cached list.
import { useEffect, useRef, useState } from 'react'
import { call, MAX_TABS } from '../api'
import { connectionUrl } from '../links'
import { ago, plural } from '../term'
import { ENV } from '../table'
import { platform, type FailedSyncs } from '../failed-syncs'
import type { ConnectionHit, Connections, ConnectionSearch, ProjectRef } from '../projects'
import { groupKey, groupList, groupRows, type ConnGroup, type Groups } from '../groups'
import { addOp, editGroups } from '../shared/GroupPicker'
import { Icon } from '../shared/icons'
import { stagger } from '../shared/card'
import { Browse, Empty, MAX_AGE, SearchBox, StatusLine, commandState, pageCount, useBrowse, type Common, type Exec, type OpenFailed } from './browse'
import { ConnectionList, SelectToggle } from './connections'

export const listGroups = (exec: Exec) => exec('groups-list', { env: ENV })
export { GroupAdd } from '../shared/GroupPicker'

// Groups above the Connections search results, like pinned projects above Projects. Always shown, so a first group
// can be made here: New group creates an empty note and opens it (add connections from there).
export function GroupList({ groups, now, open, exec }: { groups?: Groups; now: number; open: (id: string, name: string) => void; exec: Exec }) {
  const list = groupList(groups ?? {})
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const create = () => {
    const to = name.trim()
    if (!to) return
    if (groups?.[groupKey(to)]) return setErr('A group with that name exists')
    editGroups(exec, { op: 'create', name: to })
    setCreating(false); setName(''); setErr('')
    open(groupKey(to), to)
  }
  return <>
    <div className="cgroup-list-head">
      <p className="eyebrow">Groups</p>
      {!creating && <button className="link-btn" onClick={() => setCreating(true)}><Icon d="plus" size={12} />New group</button>}
    </div>
    {creating && (
      <form className="cgroup-new cgroup-create" onSubmit={e => { e.preventDefault(); create() }}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setCreating(false); setErr('') } }}>
        <input className="text-input" autoFocus placeholder="Group name, e.g. Craver Meta" aria-label="New group name" value={name}
          onChange={e => { setName(e.target.value); setErr('') }} />
        <button className="btn sm" disabled={!name.trim()}><Icon d="plus" size={13} />Create</button>
        <button type="button" className="btn ghost sm" onClick={() => { setCreating(false); setErr('') }}>Cancel</button>
      </form>
    )}
    {err && <p className="err">{err}</p>}
    {!list.length && !creating && (
      <button className="cgroup-empty" onClick={() => setCreating(true)}>
        <Icon d="plus" size={14} />
        <span><strong>Add a group</strong><span className="muted">Collect connections to check and open together. Or use + on a card below.</span></span>
      </button>
    )}
    {!!list.length && <ul className="proj-list">
      {list.map(([id, g], i) => {
        const rows = Object.values(g.conns)
        const failing = rows.filter(c => c.status === 'FAIL').length
        return (
          <li key={id} style={stagger(i)}>
            <button className="proj" onClick={() => open(id, g.name)}>
              <Icon d="plug" size={15} />
              <span className="proj-main">
                <strong title={g.name}>{g.name}</strong>
                <span className="muted mono">{plural(rows.length, 'conn')} · {!rows.length ? 'empty' : g.at ? `checked ${ago(g.at, now)}` : 'not checked yet'}</span>
              </span>
              {failing > 0 && <span className="count-chip" title={`${failing} with a FAIL newest sync`}>{failing}</span>}
              <Icon d="chevron" />
            </button>
          </li>
        )
      })}
    </ul>}
    <p className="eyebrow">All connections</p>
  </>
}

export function GroupView({ id, groups, search, fs, openProject, openFailed, renamed, back, ...c }: {
  id: string; groups?: Groups; search?: Connections; fs?: FailedSyncs; openProject: (p: ProjectRef) => void; openFailed: OpenFailed
  renamed: (key: string, name: string) => void; back: () => void
} & Common) {
  const g = groups?.[id]
  const rows = g ? groupRows(g) : []
  const ids = rows.map(r => r.connectionId).join(',')
  const extra = { env: ENV, ids }
  const { mine } = commandState(c.run, 'connection-group', extra)
  const saving = commandState(c.run, 'groups-edit').mine
  const check = () => { if (ids) c.exec('connection-group', extra) }
  // Re-reads the notes once per visit (an agent may have edited them), then checks the connections whenever the
  // member list changes and the group was never checked, is older than MAX_AGE, or has ids known only from the note.
  useEffect(() => { if (c.ready) listGroups(c.exec) }, [c.ready])
  const asked = useRef('')
  useEffect(() => {
    if (!c.ready || !ids || asked.current === ids) return
    if (g?.at && Date.now() - g.at < MAX_AGE && !rows.some(r => r.stub)) return
    asked.current = ids
    check()
  }, [c.ready, ids])
  const [selecting, setSelecting] = useState(false)
  const [adding, setAdding] = useState(() => !rows.length) // an empty (e.g. just created) group opens with its search
  const [batch, setBatch] = useState(0) // next batch of MAX_TABS to open
  const [openErr, setOpenErr] = useState('')
  const urls = rows.filter(r => !r.gone).map(r => connectionUrl(r)).filter((u): u is string => !!u)
  const from = Math.min(batch * MAX_TABS, Math.max(urls.length - 1, 0))
  const chunk = urls.slice(from, from + MAX_TABS)
  const openAll = () => call({ type: 'openTabs', urls: chunk }).then(
    () => { setOpenErr(''); setBatch(from + MAX_TABS >= urls.length ? 0 : batch + 1) }, e => setOpenErr((e as Error).message))
  if (!g || !groups) return <div className="pane">{saving ? <p className="muted">Saving…</p> : <Empty icon="search" title="Group not found" text="Its note was renamed or deleted." />}</div>
  const gone = rows.filter(r => r.gone).length
  return (
    <div className="pane">
      <GroupHead key={g.name} g={g} groups={groups} exec={c.exec} renamed={renamed} back={back} />
      {!selecting && (
        <div className="cgroup-open">
          {!!urls.length && (
            <button className="btn primary sm" onClick={openAll} title="Opens each in a background tab">
              <Icon d="external" size={13} />{urls.length <= MAX_TABS ? `Open all ${urls.length} in Refit` : `Open ${from + 1}-${from + chunk.length} of ${urls.length} in Refit`}
            </button>
          )}
          <button className="btn ghost sm" aria-expanded={adding} onClick={() => setAdding(!adding)}><Icon d={adding ? 'x' : 'plus'} size={13} />{adding ? 'Done adding' : 'Add connections'}</button>
          {urls.length > MAX_TABS && <span className="muted">{MAX_TABS} tabs at a time; click again for the next ones</span>}
          {openErr && <span className="err">{openErr}</span>}
        </div>
      )}
      {adding && !selecting && <GroupSearch g={g} page={search} {...c} />}
      <StatusLine run={c.run} now={c.now} command="connection-group" extra={extra} loading={mine} onRefresh={() => { listGroups(c.exec); check() }} onCancel={c.cancel}
        meta={`${plural(rows.length, 'connection')}${gone ? ` · ${gone} not found` : ''}${g.at ? ` · checked ${ago(g.at, c.now)}` : ''}`}
        tools={<SelectToggle selecting={selecting} setSelecting={setSelecting} rows={rows} />} />
      {!rows.length ? <Empty icon="plug" title="No connections in this group" text="Add connections above, or with + on a card in Connections." /> : (
        <div className="results" data-stale={mine}>
          {/* ponytail: the status pill says NOT FOUND (last check missed it) or NOT CHECKED (only in the note so far) */}
          <ConnectionList rows={rows.map(r => (r.gone ? { ...r, status: 'NOT FOUND' } : r.stub ? { ...r, status: 'NOT CHECKED' } : r))}
            now={c.now} openProject={openProject} openFailed={openFailed} fs={fs} pageAt={g.at ?? 0} selecting={selecting} setSelecting={setSelecting}
            buttons={(sel, done) => (
              <button className="btn ghost sm" disabled={!sel.length} onClick={() => { editGroups(c.exec, { op: 'remove', name: g.name, ids: sel.map(s => s.connectionId) }); done() }}>
                <Icon d="trash" size={13} />Remove{sel.length ? ` ${sel.length}` : ''}
              </button>
            )} />
        </div>
      )}
    </div>
  )
}

// Search every project's connections (the connections command, so it shares the Connections search's stored page)
// and add one to this group with a click.
function GroupSearch({ g, page, ...c }: { g: ConnGroup; page?: Connections } & Common) {
  const [query, setQuery] = useState<ConnectionSearch>({ q: '', platform: 'all' })
  const b = useBrowse({ page, query, command: 'connections', ...c })
  return (
    <section className="cgroup-search" aria-label="Add connections to this group">
      <Browse page={page} b={b} run={c.run} now={c.now} command="connections" cancel={c.cancel}
        meta={page?.at ? pageCount(page, 'connections') : ''}
        empty={<Empty icon="search" title="No matching connections" text="Search matches name, platform or id." />}
        rowsFor={rows => (
          <ul className="cgroup-hits">
            {(rows as ConnectionHit[]).map(r => {
              const on = !!g.conns[r.connectionId]
              return (
                <li key={r.connectionId}>
                  <span className="badge">{platform(r)}</span>
                  <span className="cgroup-hit-main"><strong title={r.name.trim()}>{r.name.trim()}</strong><span className="muted">{r.project}</span></span>
                  {on ? <span className="muted cgroup-in"><Icon d="check" size={12} />In group</span>
                    : <button className="btn ghost sm" onClick={() => editGroups(c.exec, addOp(g.name, [r]))} aria-label={`Add ${r.name.trim()} to ${g.name}`}><Icon d="plus" size={12} />Add</button>}
                </li>
              )
            })}
          </ul>
        )}>
        <SearchBox value={query.q} onChange={q => setQuery({ ...query, q })} placeholder="Find a connection by name, platform or id" autoFocus />
      </Browse>
    </section>
  )
}

// Name (edit in place: Enter or leaving the field saves) and Delete, which asks once more.
function GroupHead({ g, groups, exec, renamed, back }: { g: ConnGroup; groups: Groups; exec: Exec; renamed: (key: string, name: string) => void; back: () => void }) {
  const [name, setName] = useState(g.name)
  const [err, setErr] = useState('')
  const [confirm, setConfirm] = useState(false)
  const commit = () => {
    const to = name.trim()
    if (to === g.name) return
    if (!to) { setName(g.name); return }
    if (groups[groupKey(to)] && groupKey(to) !== groupKey(g.name)) { setErr('Another group has that name'); setName(g.name); return }
    setErr('')
    editGroups(exec, { op: 'rename', name: g.name, to })
    renamed(groupKey(to), to)
  }
  return (
    <div className="cgroup-head">
      <div className="cgroup-name">
        <input className="text-input" aria-label="Group name" value={name} onChange={e => setName(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape' && name !== g.name) { setName(g.name); e.stopPropagation() } }} />
        {confirm ? <>
          <button className="btn sm danger" onClick={() => { editGroups(exec, { op: 'delete', name: g.name }); back() }}>Delete</button>
          <button className="btn ghost sm" onClick={() => setConfirm(false)}>Cancel</button>
        </> : <button className="icon-btn sm" aria-label="Delete group" title="Delete group (its note; the connections stay in Refit)" onClick={() => setConfirm(true)}><Icon d="trash" size={14} /></button>}
      </div>
      {err && <p className="err">{err}</p>}
      <p className="muted cgroup-note">{confirm ? 'Deletes the group\'s note only. Its connections stay in Refit.' : `Obsidian: refit-sidecar/groups/${ENV === 'stag' ? 'staging' : 'production'}/${g.file}`}</p>
    </div>
  )
}
