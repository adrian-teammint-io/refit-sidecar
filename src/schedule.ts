// Sync schedules (sync_schedule: one daily cron in KST + a range per connection): the project-schedules parser,
// cron in plain English, and the form defaults for the mass update. Pure, so plain node can test it.
import { parseTable } from './table.ts'

// sync_schedule_range values with what each fetches (labels follow refit-app-2's AppSyncSchedule.ranges)
export const RANGES = [
  ['DAY', 'Yesterday'], ['LAST_2DAYS', 'Last 2 days'], ['WEEK', 'Last 7 days'],
  ['MONTH', 'Last month'], ['THIS_MONTH', 'This month'], ['THIS_2MONTH', 'Last 2 months'],
] as const
export type Range = (typeof RANGES)[number][0]
export const rangeLabel = (r: string) => RANGES.find(([v]) => v === r)?.[1] ?? r

// Hours Refit's own form offers (it hides 00-03); the update-schedules hour param takes the same.
export const HOURS = Array.from({ length: 20 }, (_, i) => i + 4)
export const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`

export type ScheduleRow = { projectId: string; project: string; cron: string; range: string; connections: number }
export type Schedules = { at: number; runId: string; projects: string; rows: ScheduleRow[]; error?: string } // projects: the ids asked for, comma-joined

export function parseSchedules(stdout: string): ScheduleRow[] {
  return parseTable(stdout, {
    cols: { projectId: 'project_id', project: 'project', cron: 'cron', range: 'range', connections: 'connections' },
    numbers: ['connections'],
  }).rows as ScheduleRow[]
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const num = (f: string, max: number) => (/^\d{1,2}$/.test(f) && Number(f) <= max ? Number(f) : undefined)
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`

// "0 4 * * *" -> "Every day at 04:00 KST". Plain numbers and * only (what refit-gql writes: daily; weekly / monthly
// shapes read too); anything else (ranges, steps, lists) comes back as the raw cron, so it's never misread.
export function cronText(cron: string): string {
  const f = cron.trim().split(/\s+/)
  if (f.length !== 5) return cron
  const [mi, h, dom, mon, dow] = f
  const minute = num(mi, 59), hour = num(h, 23)
  if (minute === undefined || hour === undefined || mon !== '*') return cron
  const at = `at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} KST`
  if (dom === '*' && dow === '*') return `Every day ${at}`
  if (dom === '*' && num(dow, 7) !== undefined) return `Every ${DAYS[num(dow, 7)! % 7]} ${at}`
  if (dow === '*' && num(dom, 31)) return `Monthly on the ${ordinal(num(dom, 31)!)} ${at}`
  return cron
}

// The daily hour of a cron refit-gql wrote ("0 H * * *"), if it is one the form offers.
export const dailyHour = (cron: string) => {
  const m = /^0 (\d{1,2}) \* \* \*$/.exec(cron.trim())
  return m && HOURS.includes(Number(m[1])) ? Number(m[1]) : undefined
}

// The form's starting values: the schedule most connections of the chosen projects already have (ties: the
// earlier row, i.e. the bigger project-local group), falling back to Refit's own defaults (04:00, DAY).
export function scheduleDefaults(rows: ScheduleRow[]): { hour: number; range: Range } {
  const weight = new Map<string, number>()
  for (const r of rows) weight.set(`${r.cron}|${r.range}`, (weight.get(`${r.cron}|${r.range}`) ?? 0) + r.connections)
  let hour = 4, range: Range = 'DAY', best = 0
  for (const [k, n] of weight) {
    const [cron, rg] = k.split('|')
    const h = dailyHour(cron)
    const known = RANGES.find(([v]) => v === rg)?.[0]
    if (n > best && h !== undefined && known) { hour = h; range = known; best = n }
  }
  return { hour, range }
}

// Rows grouped per project, in the order they came (by project name).
export function byProject(rows: ScheduleRow[]): { projectId: string; project: string; rows: ScheduleRow[] }[] {
  const out = new Map<string, { projectId: string; project: string; rows: ScheduleRow[] }>()
  for (const r of rows) {
    const g = out.get(r.projectId) ?? { projectId: r.projectId, project: r.project, rows: [] }
    g.rows.push(r)
    out.set(r.projectId, g)
  }
  return [...out.values()]
}
