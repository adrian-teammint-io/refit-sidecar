// Shared reader for Tabularis run_query JSON ({columns, rows, truncated, pagination}). Columns are looked up by name,
// so SQL column order can change freely. Pure, so plain node can test it.

export type Spec<K extends string> = { cols: Record<K, string>; nullable?: readonly NoInfer<K>[]; numbers?: readonly NoInfer<K>[] }

export function parseTable<K extends string>(stdout: string, spec: Spec<K>): { rows: Record<K, string | number | null>[]; truncated: boolean } {
  let data: { columns?: unknown; rows?: unknown; truncated?: unknown; pagination?: { has_more?: unknown } }
  try { data = JSON.parse(stdout) } catch { throw new Error('Output is not JSON') }
  if (!Array.isArray(data?.columns) || !Array.isArray(data.rows)) throw new Error('Expected {columns, rows}')
  const truncated = data.truncated === true || data.pagination?.has_more === true
  if (!data.rows.length) return { rows: [], truncated } // Tabularis sends "columns": [] when nothing matched
  const cols = data.columns as unknown[]
  const keys = Object.keys(spec.cols) as K[]
  const at = Object.fromEntries(keys.map(k => {
    const i = cols.indexOf(spec.cols[k])
    if (i < 0) throw new Error(`Missing column: ${spec.cols[k]}`)
    return [k, i]
  })) as Record<K, number>
  const nullable = new Set(spec.nullable ?? [])
  const numbers = new Set(spec.numbers ?? [])
  const rows = (data.rows as unknown[]).map((raw, n) => {
    if (!Array.isArray(raw)) throw new Error(`Row ${n} is not an array`)
    const row = {} as Record<K, string | number | null>
    for (const k of keys) {
      const v = raw[at[k]]
      // Refit stores "" for "no reason" on many rows; treat it like null.
      if (v === null || v === undefined || (v === '' && nullable.has(k))) {
        if (!nullable.has(k)) throw new Error(`Row ${n}: ${spec.cols[k]} is null`)
        row[k] = null
      } else if (numbers.has(k)) {
        const num = Number(v)
        if (!Number.isFinite(num)) throw new Error(`Row ${n}: ${spec.cols[k]} is not a number`)
        row[k] = num
      } else row[k] = String(v)
    }
    return row
  })
  return { rows, truncated }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Which Refit this code runs against. The drawer on staging-app.refit.ai is staging; the popup, worker and tests
// (no Refit hostname) are prod. Commands carry it as args.env, which the host maps to a Tabularis connection.
export type Env = 'prod' | 'stag'
export const ENV: Env = globalThis.location?.hostname === 'staging-app.refit.ai' ? 'stag' : 'prod'
export const APP = ENV === 'stag' ? 'https://staging-app.refit.ai' : 'https://app.refit.ai'
// Results are kept per environment: prod keeps the plain key names (the popup and badge read those), staging prefixes them.
export const envKey = (env: string | undefined, key: string) => (env === 'stag' ? `stag.${key}` : key)
export const DATA_KEYS = ['failedSyncs', 'projects', 'projectConnections', 'connections', 'fittingRooms', 'pins', 'projectMembers', 'userSearch'] as const
