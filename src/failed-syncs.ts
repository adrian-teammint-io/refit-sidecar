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
  // A later SUCCESS on the same connection covering this FAIL's end date (null when none; absent in results stored
  // before the column existed).
  recoveredStart?: string | null
  recoveredEnd?: string | null
  recoveredAt?: string | null // ISO UTC, that SUCCESS's create_at
}

export type FailedSyncs = { at: number; runId: string; rows: FailedSync[]; truncated: boolean; error?: string }
// The drawer's Sync requests tabs. FAIL stays in `failedSyncs` (popup + toolbar icon read it); the others are kept
// per status in `syncRequests`.
export const SYNC_STATUSES = ['FAIL', 'IN_PROGRESS', 'FRAGMENTED'] as const
export type SyncStatus = (typeof SYNC_STATUSES)[number]
export type SyncRequests = Partial<Record<Exclude<SyncStatus, 'FAIL'>, FailedSyncs>>

export function parseFailedSyncs(stdout: string): { rows: FailedSync[]; truncated: boolean } {
  const r = parseTable(stdout, {
    cols: {
      id: 'id', connectionId: 'connection_id', projectId: 'project_id', project: 'project', name: 'name', kind: 'kind',
      service: 'service', type: 'type', start: 'start_date', end: 'end_date', reason: 'reason',
      displayReason: 'display_reason', updatedAt: 'update_at',
      recoveredStart: 'recovered_start', recoveredEnd: 'recovered_end', recoveredAt: 'recovered_at',
    },
    nullable: ['service', 'start', 'end', 'reason', 'displayReason', 'recoveredStart', 'recoveredEnd', 'recoveredAt'],
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

// refit-app-2 route: /_auth/$projectId/fitting/$fittingRoomId
export const fittingRoomUrl = (r: { projectId: string; id: string }) =>
  UUID.test(r.projectId) && UUID.test(r.id) ? `${APP}/${r.projectId}/fitting/${r.id}` : undefined

// What a connection card shows about failures, kept in step with the Sync requests FAIL list: when that list is newer
// than the card's page (a refetch, or a delete dropping rows), its rows win. Otherwise the page's own values, with the
// reason only while the newest sync is FAIL (a resolved row can keep its old reason text).
export function liveFails(
  c: { connectionId: string; failed: number; status: string | null; reason: string | null; displayReason: string | null },
  pageAt: number, fs?: FailedSyncs,
): { failed: number; reason: string | null } {
  if (fs && !fs.error && fs.at >= pageAt) {
    const mine = fs.rows.filter(r => r.connectionId === c.connectionId) // newest first
    // A truncated list only holds the newest rows, so "none here" doesn't prove none at all.
    // The reason box skips FAILs a later SUCCESS already covers ("Succeeded after"): resolved, though still FAIL rows.
    const open = mine.find(r => !r.recoveredAt)
    if (mine.length || !fs.truncated) return { failed: mine.length, reason: open ? open.displayReason ?? open.reason ?? 'No reason recorded' : null }
  }
  return { failed: c.failed, reason: c.status === 'FAIL' ? c.displayReason ?? c.reason : null }
}

export const platform =(r: Pick<FailedSync, 'service' | 'kind'>) => r.service ?? r.kind

// "2026-08-31 → 2026-09-30", or a single date when start == end.
export function dateRange(r: Pick<FailedSync, 'start' | 'end'>) {
  if (!r.start && !r.end) return 'no date range'
  if (r.start === r.end || !r.end) return r.start!
  return `${r.start ?? '…'} → ${r.end}`
}
