// Saved connection groups. The source of truth is one Markdown note per group in the Obsidian vault, read and edited
// through the host (host/groups.mjs: groups-list / groups-edit). storage.local "groups" (per environment) is only a
// cache of that list plus each connection's last status snapshot (connection-group, host/sql/connection-group.sql).
// Pure, so plain node tests it.
import type { ConnectionHit } from './projects'
import { statusRank } from './failed-syncs.ts'

export const MAX_GROUP = 100 // the connection-group ids param takes at most 100 (and groups.mjs refuses more)

// gone: the last check didn't find it (deleted in Refit). stub: only known from the note so far, not checked yet.
export type GroupConn = ConnectionHit & { gone?: true; stub?: true }
export type ConnGroup = { name: string; file: string; at?: number; conns: Record<string, GroupConn> } // at: last check
export type Groups = Record<string, ConnGroup> // by groupKey(name)
export type GroupFiles = { groups: { name: string; file: string; conns: { id: string; label: string }[] }[] } // groups.mjs stdout
export type GroupOp =
  | { op: 'create'; name: string }
  | { op: 'add'; name: string; conns: { id: string; label: string }[] }
  | { op: 'remove'; name: string; ids: string[] }
  | { op: 'rename'; name: string; to: string }
  | { op: 'delete'; name: string }

export const groupKey = (name: string) => name.trim().toLowerCase()

// The label written next to each id in the note, and read back for a connection not checked yet.
export const groupLabel = (c: ConnectionHit) => [c.service ?? c.kind, c.name.trim(), c.project].join(' · ')

function stubOf(id: string, label: string): GroupConn {
  const [platform, name, project] = label.split(' · ')
  const known = project !== undefined
  return {
    connectionId: id, projectId: '', project: known ? project : '', name: (known ? name : label) || id,
    kind: known && platform === 'FILE' ? 'FILE' : 'SERVICE', service: known && platform !== 'FILE' ? platform : null,
    start: null, end: null, status: null, syncType: null, lastSync: null, reason: null, displayReason: null, failed: 0, stub: true,
  }
}

// The notes as the cache: members and names from the files, each connection's snapshot from any cached group.
export function fromFiles(files: GroupFiles, prev: Groups = {}): Groups {
  const snaps = new Map<string, GroupConn>()
  for (const g of Object.values(prev)) for (const c of Object.values(g.conns)) if (!c.stub) snaps.set(c.connectionId.toLowerCase(), c)
  const out: Groups = {}
  for (const f of files.groups) {
    const key = groupKey(f.name)
    const conns: Record<string, GroupConn> = {}
    for (const { id, label } of f.conns) conns[id] = snaps.get(id.toLowerCase()) ?? stubOf(id, label)
    const old = prev[key]
    out[key] = { name: f.name, file: f.file, conns, ...(old?.at && !Object.values(conns).some(c => c.stub) ? { at: old.at } : {}) }
  }
  return out
}

// Folds a connection-group result into every group: fresh rows replace snapshots, asked ids that didn't come back are
// marked gone. A group whose connections were all asked gets `at`.
export function refreshGroups(groups: Groups, asked: string[], rows: ConnectionHit[], at: number): Groups {
  const ids = new Set(asked.map(a => a.toLowerCase()))
  const byId = new Map(rows.map(r => [r.connectionId.toLowerCase(), r]))
  const next: Groups = {}
  for (const [gid, g] of Object.entries(groups)) {
    const conns: Record<string, GroupConn> = {}
    for (const [cid, c] of Object.entries(g.conns)) {
      const k = cid.toLowerCase()
      conns[cid] = !ids.has(k) ? c : byId.get(k) ?? { ...c, gone: true, stub: undefined }
    }
    const all = Object.keys(g.conns).every(c => ids.has(c.toLowerCase()))
    next[gid] = { ...g, conns, ...(all && Object.keys(g.conns).length ? { at } : {}) }
  }
  return next
}

// The toast after a groups-edit run.
export function opSummary(op: GroupOp): string {
  if (op.op === 'add') return `Added ${op.conns.length === 1 ? op.conns[0].label.split(' · ')[1] ?? '1 connection' : `${op.conns.length} connections`} to ${op.name}`
  if (op.op === 'remove') return `Removed ${op.ids.length === 1 ? '1 connection' : `${op.ids.length} connections`} from ${op.name}`
  if (op.op === 'rename') return `Renamed ${op.name} to ${op.to}`
  if (op.op === 'create') return `Created group ${op.name}`
  return `Deleted group ${op.name}`
}

// A group's connections as a list: by newest sync status (statusRank; not found / not checked count as "the rest"),
// then name.
export const groupRows = (g: ConnGroup) =>
  Object.values(g.conns).sort((a, b) => statusRank(a.gone || a.stub ? null : a.status) - statusRank(b.gone || b.stub ? null : b.status) || a.name.trim().localeCompare(b.name.trim()))

// Groups in the Connections search: by name.
export const groupList = (groups: Groups) => Object.entries(groups).sort(([, a], [, b]) => a.name.localeCompare(b.name))
