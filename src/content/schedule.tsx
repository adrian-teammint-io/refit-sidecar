// Sync schedule: one daily time (KST) and range for every scheduled connection of the projects picked in Projects'
// select mode. Shows what they have now (project-schedules) in plain English and starts the form from the most
// common current value; the write is update-schedules (a fixed-shape UPDATE of sync_schedule, see host/protocol.mjs).
import { useEffect, useRef, useState } from 'react'
import { plural } from '../term'
import { ENV } from '../table'
import type { ProjectRef } from '../projects'
import { HOURS, RANGES, byProject, cronText, hourLabel, rangeLabel, scheduleDefaults, type Range, type Schedules } from '../schedule'
import { Icon } from '../shared/icons'
import { ErrorBanner, RunBar, Skeleton, commandState, type Common } from './browse'
import { WriteConfirm } from './ui'

export function ScheduleView({ projects, schedules, run, now, ready, exec, cancel }: {
  projects: ProjectRef[]; schedules?: Schedules
} & Common) {
  const ids = projects.map(p => p.id).join(',')
  const load = () => exec('project-schedules', { env: ENV, projects: ids })
  const asked = useRef(false)
  useEffect(() => { if (ready && !asked.current) { asked.current = true; load() } }, [ready])

  const fresh = schedules?.projects === ids ? schedules : undefined
  const rows = fresh?.rows ?? []
  const total = rows.reduce((n, r) => n + r.connections, 0)
  const fetching = commandState(run, 'project-schedules', { projects: ids })
  const saving = commandState(run, 'update-schedules', { projects: ids })

  // Starts from the current values once they arrive; a later reload (after an update) doesn't overwrite a choice.
  const [form, setForm] = useState<{ hour: number; range: Range }>()
  useEffect(() => { if (fresh && !fresh.error && !form) setForm(scheduleDefaults(fresh.rows)) }, [fresh?.runId])
  const { hour, range } = form ?? scheduleDefaults([])
  const cron = `0 ${hour} * * *`
  const alreadySet = !!total && rows.every(r => r.cron === cron && r.range === range)
  const groups = byProject(rows)
  const empty = projects.filter(p => !groups.some(g => g.projectId === p.id))

  return (
    <div className="pane np">
      <RunBar running={fetching.mine} onCancel={cancel}
        text={fetching.mine ? 'Reading current schedules…' : fetching.busy ? `Queued after ${fetching.busy}` : fresh ? `${plural(total, 'scheduled connection')} in ${plural(projects.length, 'project')}` : ''}
        refresh={<button className="icon-btn sm" onClick={load} aria-label="Refresh" title="Refresh" data-refetch><Icon d="refresh" size={14} /></button>} />
      <ErrorBanner error={fresh?.error} hasRows={!!rows.length} />

      <section className="field">
        <p className="eyebrow">Now</p>
        {!fresh ? <Skeleton rows={Math.min(projects.length, 3)} /> : (
          <ul className="sched-list" data-stale={fetching.mine}>
            {groups.map(g => (
              <li key={g.projectId}>
                <strong title={g.project}>{g.project}</strong>
                {g.rows.map(r => (
                  <span key={`${r.cron}|${r.range}`} className="sched-line">
                    <span>{cronText(r.cron)} · {rangeLabel(r.range)}</span>
                    <span className="muted mono">{plural(r.connections, 'conn')}</span>
                  </span>
                ))}
              </li>
            ))}
            {empty.map(p => <li key={p.id}><strong title={p.name}>{p.name}</strong><span className="sched-line muted">No scheduled connections</span></li>)}
          </ul>
        )}
      </section>

      <div className="sched-form">
        <section className="field">
          <label className="eyebrow" htmlFor="sched-hour">Time <span className="eyebrow-note">KST, every day</span></label>
          <select id="sched-hour" className="text-input" value={hour} disabled={!form} onChange={e => setForm({ range, hour: Number(e.target.value) })}>
            {HOURS.map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
        </section>
        <section className="field">
          <label className="eyebrow" htmlFor="sched-range">Range <span className="eyebrow-note">what each sync fetches</span></label>
          <select id="sched-range" className="text-input" value={range} disabled={!form} onChange={e => setForm({ hour, range: e.target.value as Range })}>
            {RANGES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </section>
      </div>

      <div className="bulk np-confirm" data-open="true">
        <WriteConfirm waiting={saving.mine} busy={saving.busy}
          title={<strong>Set {plural(total, 'connection')} to {cronText(cron).replace(/^E/, 'e')} · {rangeLabel(range)}</strong>}
          note={!fresh ? 'Reading the current schedules first…' : !total ? 'These projects have no scheduled connections.'
            : alreadySet ? 'Every connection already has this schedule.'
            : 'Scheduled syncs pick it up within the hour. Approve it in Tabularis when asked.'}
          action={{ label: <><Icon d="check" size={13} />Update {total || ''}</>, disabled: !form || !total || alreadySet,
            onClick: () => exec('update-schedules', { env: ENV, projects: ids, hour: String(hour), range }) }} />
      </div>
    </div>
  )
}
