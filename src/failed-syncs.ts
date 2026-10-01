// Parser for the `failed-syncs` command: Tabularis run_query JSON ({columns, rows, truncated, pagination})
// produced by host/sql/failed-syncs.sql. Pure, so plain node can test it against a captured sample.

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

const COLS = {
  id: 'id', connectionId: 'connection_id', projectId: 'project_id', project: 'project', name: 'name', kind: 'kind',
  service: 'service', type: 'type', start: 'start_date', end: 'end_date', reason: 'reason',
  displayReason: 'display_reason', updatedAt: 'update_at',
} as const satisfies Record<keyof FailedSync, string>
const NULLABLE = new Set<keyof FailedSync>(['service', 'start', 'end', 'reason', 'displayReason'])

export function parseFailedSyncs(stdout: string): { rows: FailedSync[]; truncated: boolean } {
  let data: { columns?: unknown; rows?: unknown; truncated?: unknown; pagination?: { has_more?: unknown } }
  try { data = JSON.parse(stdout) } catch { throw new Error('Output is not JSON') }
  if (!Array.isArray(data?.columns) || !Array.isArray(data.rows)) throw new Error('Expected {columns, rows}')
  const cols = data.columns as unknown[]
  const at = Object.fromEntries(Object.entries(COLS).map(([k, c]) => {
    const i = cols.indexOf(c)
    if (i < 0) throw new Error(`Missing column: ${c}`)
    return [k, i]
  })) as Record<keyof FailedSync, number>
  const rows = (data.rows as unknown[]).map((raw, n) => {
    if (!Array.isArray(raw)) throw new Error(`Row ${n} is not an array`)
    const row = {} as Record<keyof FailedSync, string | null>
    for (const k of Object.keys(COLS) as (keyof FailedSync)[]) {
      const v = raw[at[k]]
      if (v === null || v === undefined) {
        if (!NULLABLE.has(k)) throw new Error(`Row ${n}: ${COLS[k]} is null`)
        row[k] = null
      } else row[k] = String(v)
    }
    return row as FailedSync
  })
  return { rows, truncated: data.truncated === true || data.pagination?.has_more === true }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const APP = 'https://app.refit.ai'

// refit-app-2 route: /_auth/$projectId/datasources/{service|file}/$datasourceId (datasourceId = connection.id).
// Ids come from the DB, but a URL is still only built from values that look like UUIDs.
export function connectionUrl(r: Pick<FailedSync, 'projectId' | 'connectionId' | 'kind'>): string | undefined {
  const kind = r.kind === 'SERVICE' ? 'service' : r.kind === 'FILE' ? 'file' : undefined
  if (!kind || !UUID.test(r.projectId) || !UUID.test(r.connectionId)) return undefined
  return `${APP}/${r.projectId}/datasources/${kind}/${r.connectionId}`
}

export const platform = (r: Pick<FailedSync, 'service' | 'kind'>) => r.service ?? r.kind

// "2026-08-31 → 2026-09-30", or a single date when start == end.
export function dateRange(r: Pick<FailedSync, 'start' | 'end'>) {
  if (!r.start && !r.end) return 'no date range'
  if (r.start === r.end || !r.end) return r.start!
  return `${r.start ?? '…'} → ${r.end}`
}
