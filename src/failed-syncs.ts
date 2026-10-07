// Parser for the `failed-syncs` command (host/sql/failed-syncs.sql), plus label helpers the project views reuse.
// Pure, so plain node can test it against a captured sample.
import { parseTable } from './table.ts'
import { connectionUrl } from './links.ts'

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
  status?: string // sync_request.status (absent in results stored before the column existed)
}

export type FailedSyncs = { at: number; runId: string; rows: FailedSync[]; truncated: boolean; error?: string }
// The drawer's Sync requests tabs. FAIL stays in `failedSyncs` (popup + toolbar icon read it); the others are kept
// per tab in `syncRequests`. OTHER: every status but SUCCESS and FAIL (IN_PROGRESS, READY, FRAGMENTED, CANCEL...).
export const SYNC_STATUSES = ['FAIL', 'OTHER', 'FRAGMENTED'] as const
export type SyncStatus = (typeof SYNC_STATUSES)[number]
export type SyncRequests = Partial<Record<Exclude<SyncStatus, 'FAIL'>, FailedSyncs>>

export function parseFailedSyncs(stdout: string): { rows: FailedSync[]; truncated: boolean } {
  const r = parseTable(stdout, {
    cols: {
      id: 'id', connectionId: 'connection_id', projectId: 'project_id', project: 'project', name: 'name', kind: 'kind',
      service: 'service', type: 'type', start: 'start_date', end: 'end_date', reason: 'reason',
      displayReason: 'display_reason', updatedAt: 'update_at',
      recoveredStart: 'recovered_start', recoveredEnd: 'recovered_end', recoveredAt: 'recovered_at', status: 'status',
    },
    nullable: ['service', 'start', 'end', 'reason', 'displayReason', 'recoveredStart', 'recoveredEnd', 'recoveredAt'],
  })
  return { rows: r.rows as FailedSync[], truncated: r.truncated }
}

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

export const platform = (r: Pick<FailedSync, 'service' | 'kind'>) => r.service ?? r.kind

// Connection lists' status order (the SQL's CASE in connections.sql / project-connections.sql /
// fitting-room-connections.sql): FAIL, IN_PROGRESS, FRAGMENTED, SUCCESS, then anything else (never synced...).
const RANK: Record<string, number> = { FAIL: 0, IN_PROGRESS: 1, FRAGMENTED: 2, SUCCESS: 3 }
export const statusRank = (status: string | null | undefined) => RANK[status ?? ''] ?? 4

// "2026-08-31 → 2026-09-30", or a single date when start == end.
export function dateRange(r: Pick<FailedSync, 'start' | 'end'>) {
  if (!r.start && !r.end) return 'no date range'
  if (r.start === r.end || !r.end) return r.start!
  return `${r.start ?? '…'} → ${r.end}`
}

// The Sync requests "Not SUCCESS nor FAIL" tab's Copy Markdown: one "- [name](url): MM-DD ~ MM-DD" list item per row (a
// list, so renderers keep one per line), no dates part when the row has none. Brackets in a name are escaped.
const md = (d: string | null) => d?.slice(5) ?? '?'
export const syncMarkdown = (rows: FailedSync[]) => rows.map(r =>
  `- [${r.name.trim().replace(/([[\]\\])/g, '\\$1')}](${connectionUrl(r) ?? ''})${r.start || r.end ? `: ${md(r.start)} ~ ${md(r.end)}` : ''}`).join('\n')
