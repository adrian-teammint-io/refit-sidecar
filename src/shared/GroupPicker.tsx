// The Add to group picker, shared by the drawer (a connection card's +, the Select bar) and the toolbar popup (the
// connection in the current tab). Groups are vault notes edited through the host's groups-edit (host/groups.mjs).
// Styles: src/ui.css (.cgroup-*).
import { useState } from 'react'
import type { Args, Command } from '../api'
import { ENV, type Env } from '../table'
import { toHex, type ConnectionHit } from '../projects'
import { groupLabel, groupList, type ConnGroup, type GroupOp, type Groups } from '../groups'
import { Icon } from './icons'

type Exec = (command: Command, args?: Args) => void
export const editGroups = (exec: Exec, op: GroupOp, env: Env = ENV) => exec('groups-edit', { env, body: toHex(JSON.stringify(op)) })
// A connection known only by id (stub: the popup's tab, never loaded in the drawer) goes in without a label.
export const addOp = (name: string, rows: (ConnectionHit & { stub?: true })[]): GroupOp =>
  ({ op: 'add', name, conns: rows.map(c => ({ id: c.connectionId, label: c.stub ? '' : groupLabel(c) })) })

// Existing groups as chips (one click adds; a check marks groups that already hold every picked connection), filtered
// by the name field, which also creates a new group. In the Connections search's Select bar, or inside one card
// (`card`: opened by its + button, focused, Esc closes it).
export function GroupAdd({ groups, rows, done, card, exec, env = ENV, focus = card }: {
  groups?: Groups; rows: (ConnectionHit & { stub?: true })[]; done: () => void; card?: boolean; exec: Exec; env?: Env
  focus?: boolean // focus the name field on mount (a card's form)
}) {
  const [name, setName] = useState('')
  const list = groupList(groups ?? {})
  const needle = name.trim().toLowerCase()
  const shown = list.filter(([, g]) => !needle || g.name.toLowerCase().includes(needle))
  const exact = list.some(([, g]) => g.name.toLowerCase() === needle)
  const has = (g: ConnGroup) => !!rows.length && rows.every(r => g.conns[r.connectionId])
  const n = card ? '' : ` ${rows.length || ''}`
  // The toast reports the result (or why the note couldn't be written); the form closes at once.
  const add = (to: string) => { if (to.trim() && rows.length) { editGroups(exec, addOp(to.trim(), rows), env); done() } }
  return (
    <form className={card ? 'cgroup-add in-card' : 'cgroup-add'} onSubmit={e => { e.preventDefault(); add(name) }}
      onKeyDown={e => { if (card && e.key === 'Escape') { e.stopPropagation(); done() } }}>
      {!list.length ? <p className="muted cgroup-none">{`No groups yet. Name one below to create it${rows.length > 1 ? ` with these ${rows.length}` : ''}.`}</p> : (
        <div className="cgroup-chips" role="group" aria-label="Add to a group">
          {shown.map(([id, g]) => {
            const on = has(g)
            return (
              <button type="button" key={id} className="chip cgroup-chip" data-on={on} disabled={on || !rows.length} onClick={() => add(g.name)}
                title={on ? 'Already in this group' : `Add to ${g.name}`}>
                <Icon d={on ? 'check' : 'plus'} size={11} />{g.name}<span className="cgroup-count">{Object.keys(g.conns).length}</span>
              </button>
            )
          })}
          {!shown.length && <span className="muted cgroup-none">No group matches. Create one below.</span>}
        </div>
      )}
      <div className="cgroup-new">
        <input className="text-input" placeholder={list.length ? 'Filter, or name a new group' : 'Group name, e.g. Craver Meta'} aria-label="Group name"
          value={name} onChange={e => setName(e.target.value)} autoFocus={focus} />
        <button className="btn sm" disabled={!rows.length || !needle}>
          <Icon d="plus" size={13} />{exact ? `Add${n}` : !list.length ? 'Create group' : card ? 'New group' : `New group with${n}`}
        </button>
      </div>
    </form>
  )
}

