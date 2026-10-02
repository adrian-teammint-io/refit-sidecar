// Parsers and batch ("load more") bookkeeping for the browse commands: projects, project-connections, connections,
// fitting-rooms (host/sql/*.sql). Pure, so plain node can test them against captured samples.
import type { Args } from './api'
import { parseTable } from './table.ts'

// Rows per batch. Each SQL file asks for BATCH + 1 (LIMIT 31); the extra row only says whether more exist.
export const BATCH = 30

export type Project = {
  id: string
  name: string
  status: string // ACTIVE | PAUSED
  plan: string | null // BASIC, TRIAL, DEMO, ...
  connections: number
  failed: number // FAIL sync_requests across the project's connections
  lastSync: string | null // ISO UTC of the newest sync_request update
}

export type ProjectConnection = {
  connectionId: string
  projectId: string
  name: string
  kind: string // SERVICE | FILE
  service: string | null
  start: string | null // connection.data_start
  end: string | null // connection.data_end
  status: string | null // newest sync_request: SUCCESS, FAIL, FRAGMENTED, ... (null: never synced)
  syncType: string | null
  lastSync: string | null
  reason: string | null
  displayReason: string | null
  failed: number // FAIL sync_requests on this connection
}

export type ConnectionHit = ProjectConnection & { project: string }

export type FittingRoom = {
  id: string
  projectId: string
  project: string
  projectStatus: string
  name: string
  nodes: number // transactions in the pipeline
  outputs: number // fitdata tables it produces
  notOk: number // fitdata syncs not in SUCCESS
  updatedAt: string
  lastFit: string | null // newest fitdata sync
}

// The search behind a list; a new query replaces the list, the same query + offset appends ("load more").
export type ProjectsQuery = { q: string; status: 'all' | 'ACTIVE' | 'PAUSED'; sort: 'active' | 'name' | 'recent' }
export type ConnectionsQuery = { q: string; sort: 'status' | 'service' | 'name' }
export type TextQuery = { q: string }
export type Page<T, Q> = { at: number; runId: string; query: Q; rows: T[]; hasMore: boolean; error?: string }

// storage.local keys
export type Projects = Page<Project, ProjectsQuery>
export type ProjectConnections = Record<string, Page<ProjectConnection, ConnectionsQuery>> // by project id
export type Connections = Page<ConnectionHit, TextQuery>
export type FittingRooms = Page<FittingRoom, TextQuery>
export type Pins = Record<string, Project & { pinnedAt: number }> // snapshot, refreshed whenever the project is fetched again

const CONN_COLS = {
  connectionId: 'id', projectId: 'project_id', name: 'name', kind: 'kind', service: 'service', start: 'data_start', end: 'data_end',
  status: 'status', syncType: 'sync_type', lastSync: 'last_sync', reason: 'reason', displayReason: 'display_reason', failed: 'failed',
} as const
const CONN_NULLABLE = ['service', 'start', 'end', 'status', 'syncType', 'lastSync', 'reason', 'displayReason'] as const

export function parseProjects(stdout: string): Project[] {
  return parseTable(stdout, {
    cols: { id: 'id', name: 'name', status: 'status', plan: 'plan', connections: 'connections', failed: 'failed', lastSync: 'last_sync' },
    nullable: ['plan', 'lastSync'],
    numbers: ['connections', 'failed'],
  }).rows as Project[]
}

export function parseProjectConnections(stdout: string): ProjectConnection[] {
  return parseTable(stdout, { cols: CONN_COLS, nullable: CONN_NULLABLE, numbers: ['failed'] }).rows as ProjectConnection[]
}

export function parseConnections(stdout: string): ConnectionHit[] {
  return parseTable(stdout, { cols: { ...CONN_COLS, project: 'project' }, nullable: CONN_NULLABLE, numbers: ['failed'] }).rows as ConnectionHit[]
}

export function parseFittingRooms(stdout: string): FittingRoom[] {
  return parseTable(stdout, {
    cols: {
      id: 'id', projectId: 'project_id', project: 'project', projectStatus: 'project_status', name: 'name', nodes: 'nodes',
      outputs: 'outputs', notOk: 'not_ok', updatedAt: 'updated_at', lastFit: 'last_fit',
    },
    nullable: ['lastFit'],
    numbers: ['nodes', 'outputs', 'notOk'],
  }).rows as FittingRoom[]
}

// ---------- project members (refit_user_project_relation) ----------

export const ROLES = ['viewer', 'editor', 'admin'] as const // refit_user_role values
export type ProjectRef = Pick<Project, 'id' | 'name'> & Partial<Project> // a search hit has id + name; a list row has the rest
export const PLANS = ['BASIC', 'DEMO', 'ENTERPRISE'] as const // project_plan values New project offers (no TRIAL)
export const PROJECT_STATUSES = ['PAUSED', 'ACTIVE', 'NEED_PAYMENT'] as const // project_status values
// ponytail: user-search always joins on a project for memberRole; outside one (New project) it passes the nil UUID,
// which matches no project, so memberRole is null. A project-free search command if this ever needs to differ.
export const NO_PROJECT = '00000000-0000-0000-0000-000000000000'
export type Role = (typeof ROLES)[number]
export type Member = { id: string; email: string; name: string | null; role: Role; addedAt: string; owner?: boolean } // owner: the project's create_by (absent in pages cached before it existed)
export type UserHit = { id: string; email: string; name: string | null; memberRole: Role | null } // memberRole: already in the project
export type Members = { at: number; runId: string; rows: Member[]; error?: string }
export type ProjectMembers = Record<string, Members> // by project id
export type UserSearch = { at: number; runId: string; project: string; q: string; rows: UserHit[]; error?: string }

export function parseMembers(stdout: string): Member[] {
  const { rows } = parseTable(stdout, { cols: { id: 'id', email: 'email', name: 'name', role: 'role', addedAt: 'added_at', owner: 'owner' }, nullable: ['name'], numbers: ['owner'] })
  return rows.map(r => ({ ...r, owner: r.owner === 1 })) as Member[]
}

export function parseUserHits(stdout: string): UserHit[] {
  return parseTable(stdout, { cols: { id: 'id', email: 'email', name: 'name', memberRole: 'member_role' }, nullable: ['name', 'memberRole'] }).rows as UserHit[]
}

// ---------- search text <-> command args ----------

// Search text travels as hex of its UTF-8 bytes; the host only accepts [0-9a-f] for it (see PARAMS in protocol.mjs).
export const toHex = (s: string) => Array.from(new TextEncoder().encode(s), b => b.toString(16).padStart(2, '0')).join('')
export const fromHex = (h: string) => new TextDecoder().decode(new Uint8Array((h.match(/../g) ?? []).map(b => parseInt(b, 16))))
export const MAX_QUERY_BYTES = 200 // keep in sync with the q pattern in host/commands.json

// Trims, and cuts to MAX_QUERY_BYTES without splitting a character.
export function cleanQuery(q: string) {
  let s = q.trim()
  while (new TextEncoder().encode(s).length > MAX_QUERY_BYTES) s = s.slice(0, -1)
  return s
}

export function toArgs(query: { q: string } & Record<string, string>, offset: number, extra: Args = {}): Args {
  return { ...extra, ...query, q: toHex(cleanQuery(query.q)), offset: String(offset) }
}

// The query a finished run was for, read back from its args (the worker stores pages by query).
export function queryOf<Q extends { q: string }>(args: Args | undefined, keys: readonly (keyof Q)[]): Q {
  const out: Record<string, string> = { q: fromHex(args?.q ?? '') }
  for (const k of keys) if (k !== 'q') out[k as string] = args?.[k as string] ?? ''
  return out as Q
}

export const sameQuery = (a: object, b: object) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort())

// Folds one fetched batch into the stored page. Same query and the offset right after what we have: append
// (deduped by id, in case rows shifted). Anything else: this batch replaces the page.
export function mergePage<T, Q extends object>(prev: Page<T, Q> | undefined, query: Q, offset: number, batch: T[], at: number, runId: string, id: (r: T) => string): Page<T, Q> {
  const hasMore = batch.length > BATCH
  const rows = batch.slice(0, BATCH)
  if (offset > 0 && prev && sameQuery(prev.query, query) && prev.rows.length === offset) {
    const seen = new Set(prev.rows.map(id))
    return { at, runId, query, rows: [...prev.rows, ...rows.filter(r => !seen.has(id(r)))], hasMore }
  }
  return { at, runId, query, rows, hasMore }
}

// Pages saved before batching (83c25cc) have no query, and every reader assumes one. Treat them as never fetched,
// so the view fetches a fresh page. Applied wherever storage is read (store.ts, host.ts).
const isPage = (p: unknown) => !!p && typeof p === 'object' && 'query' in p && 'rows' in p
export function dropStalePages<S extends object>(s: S): S {
  const out = { ...s } as Record<string, unknown>
  for (const k of ['projects', 'connections', 'fittingRooms']) if (out[k] !== undefined && !isPage(out[k])) delete out[k]
  if (out.projectConnections && typeof out.projectConnections === 'object')
    out.projectConnections = Object.fromEntries(Object.entries(out.projectConnections).filter(([, p]) => isPage(p)))
  return out as S
}

// Most cached projects kept in storage; the oldest fetch is dropped first.
export const MAX_CACHED_PROJECTS = 30 // ponytail: ~30 KB each; raise if you browse many projects a day

export function cacheProject<T>(cache: Record<string, T & { at: number }>, id: string, entry: T & { at: number }): Record<string, T & { at: number }> {
  const next = { ...cache, [id]: entry }
  const ids = Object.keys(next).sort((a, b) => next[b].at - next[a].at)
  for (const old of ids.slice(MAX_CACHED_PROJECTS)) delete next[old]
  return next
}

// ---------- pins ----------

export function togglePin(pins: Pins, p: Project, now: number): Pins {
  const next = { ...pins }
  if (next[p.id]) delete next[p.id]
  else next[p.id] = { ...p, pinnedAt: now }
  return next
}

// Refreshes pinned snapshots from freshly fetched rows (name, status and counts change over time).
export function refreshPins(pins: Pins, rows: Project[]): Pins | undefined {
  let changed = false
  const next = { ...pins }
  for (const r of rows) if (next[r.id] && JSON.stringify({ ...next[r.id], pinnedAt: 0 }) !== JSON.stringify({ ...r, pinnedAt: 0 })) {
    next[r.id] = { ...r, pinnedAt: next[r.id].pinnedAt }
    changed = true
  }
  return changed ? next : undefined
}

// Pinned projects shown above the list: matching the current search text, active first, then by name.
export function pinnedFor(pins: Pins, q: string, status: ProjectsQuery['status']): Project[] {
  const needle = q.trim().toLowerCase()
  return Object.values(pins)
    .filter(p => (status === 'all' || p.status === status) && (!needle || `${p.name} ${p.id} ${p.plan ?? ''}`.toLowerCase().includes(needle)))
    .sort((a, b) => Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE') || a.name.localeCompare(b.name))
}
