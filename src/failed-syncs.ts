// Parser for the `failed-syncs` command (host/sql/failed-syncs.sql), plus link/label helpers the project views reuse.
// Pure, so plain node can test it against a captured sample.
import { parseTable, UUID, APP } from './table.ts'
export { APP } from './table.ts'

export type FailedSync = {
  id: string
  connectionId: string
  projectId: string
  project: string
  name: string
  kind: string // connection.type: SERVICE | FILE
  service: string | null // service_connection.service: META, TIKTOK, GOOGLE_ADS, ...
  type: string // sync_request.type: FIRST, DAILY, ...
  start: string | null
  end: string | null
  reason: string | null
  displayReason: string | null
  updatedAt: string // ISO UTC
}

export type FailedSyncs = { at: number; runId: string; rows: FailedSync[]; truncated: boolean; error?: string }

export function parseFailedSyncs(stdout: string): { rows: FailedSync[]; truncated: boolean } {
  const r = parseTable(stdout, {
    cols: {
      id: 'id', connectionId: 'connection_id', projectId: 'project_id', project: 'project', name: 'name', kind: 'kind',
      service: 'service', type: 'type', start: 'start_date', end: 'end_date', reason: 'reason',
      displayReason: 'display_reason', updatedAt: 'update_at',
    },
    nullable: ['service', 'start', 'end', 'reason', 'displayReason'],
  })
  return { rows: r.rows as FailedSync[], truncated: r.truncated }
}

// refit-app-2 route: /_auth/$projectId/datasources/{service|file}/$datasourceId (datasourceId = connection.id).
// Ids come from the DB, but a URL is still only built from values that look like UUIDs.
export function connectionUrl(r: Pick<FailedSync, 'projectId' | 'connectionId' | 'kind'>): string | undefined {
  const kind = r.kind === 'SERVICE' ? 'service' : r.kind === 'FILE' ? 'file' : undefined
  if (!kind || !UUID.test(r.projectId) || !UUID.test(r.connectionId)) return undefined
  return `${APP}/${r.projectId}/datasources/${kind}/${r.connectionId}`
}

export const projectUrl = (projectId: string) => (UUID.test(projectId) ? `${APP}/${projectId}` : undefined)

export const platform = (r: Pick<FailedSync, 'service' | 'kind'>) => r.service ?? r.kind

// "2026-08-31 → 2026-09-30", or a single date when start == end.
export function dateRange(r: Pick<FailedSync, 'start' | 'end'>) {
  if (!r.start && !r.end) return 'no date range'
  if (r.start === r.end || !r.end) return r.start!
  return `${r.start ?? '…'} → ${r.end}`
}
