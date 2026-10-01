// Parsers for the `projects` and `project-connections` commands (host/sql/projects.sql, project-connections.sql),
// plus the search used by the Projects view. Pure, so plain node can test them against captured samples.
import { parseTable } from './table.ts'

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

export type Projects = { at: number; runId: string; rows: Project[]; error?: string }
// storage.local `projectConnections`: project id -> its last fetch
export type ProjectConnections = Record<string, { at: number; runId: string; rows: ProjectConnection[]; error?: string }>

export function parseProjects(stdout: string): Project[] {
  return parseTable(stdout, {
    cols: { id: 'id', name: 'name', status: 'status', plan: 'plan', connections: 'connections', failed: 'failed', lastSync: 'last_sync' },
    nullable: ['plan', 'lastSync'],
    numbers: ['connections', 'failed'],
  }).rows as Project[]
}

export function parseProjectConnections(stdout: string): ProjectConnection[] {
  return parseTable(stdout, {
    cols: {
      connectionId: 'id', projectId: 'project_id', name: 'name', kind: 'kind', service: 'service', start: 'data_start', end: 'data_end',
      status: 'status', syncType: 'sync_type', lastSync: 'last_sync', reason: 'reason', displayReason: 'display_reason', failed: 'failed',
    },
    nullable: ['service', 'start', 'end', 'status', 'syncType', 'lastSync', 'reason', 'displayReason'],
    numbers: ['failed'],
  }).rows as ProjectConnection[]
}

// Case-insensitive match on every word, against name, id and plan ("sk 1004", "799a63f3", "trial").
// ponytail: substring match over ~100 projects; fuzzy ranking if the list grows into the thousands
export function searchProjects(rows: Project[], q: string, status: 'all' | 'ACTIVE' | 'PAUSED' = 'all'): Project[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  return rows.filter(p => {
    if (status !== 'all' && p.status !== status) return false
    const hay = `${p.name} ${p.id} ${p.plan ?? ''}`.toLowerCase()
    return words.every(w => hay.includes(w))
  })
}

// Most cached projects kept in storage; the oldest fetch is dropped first.
export const MAX_CACHED_PROJECTS = 30 // ponytail: ~30 KB each; raise if you browse many projects a day

export function cacheProject(cache: ProjectConnections, id: string, entry: ProjectConnections[string]): ProjectConnections {
  const next = { ...cache, [id]: entry }
  const ids = Object.keys(next).sort((a, b) => next[b].at - next[a].at)
  for (const old of ids.slice(MAX_CACHED_PROJECTS)) delete next[old]
  return next
}
