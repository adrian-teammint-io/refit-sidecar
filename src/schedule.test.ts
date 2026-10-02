// Hand-made sample (shape of Tabularis run_query output; not captured from the DB). It includes a "DAY" cron, the
// value refit-gql's convertServiceConnection INSERT bug writes, and a count that arrives as a string.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { byProject, cronText, dailyHour, parseSchedules, rangeLabel, scheduleDefaults } from './schedule.ts'

const rows = parseSchedules(readFileSync(new URL('./samples/project-schedules.stdout.txt', import.meta.url), 'utf8'))
assert.equal(rows.length, 4)
assert.deepEqual(rows[1], { projectId: '00000900-0000-4000-8000-000000000900', project: 'Sample Brand KR', cron: '0 10 * * *', range: 'LAST_2DAYS', connections: 3 })

assert.equal(cronText('0 4 * * *'), 'Every day at 04:00 KST')
assert.equal(cronText(' 30 23 * * * '), 'Every day at 23:30 KST')
assert.equal(cronText('0 9 * * 1'), 'Every Monday at 09:00 KST')
assert.equal(cronText('0 9 * * 7'), 'Every Sunday at 09:00 KST')
assert.equal(cronText('0 6 1 * *'), 'Monthly on the 1st at 06:00 KST')
assert.equal(cronText('0 6 22 * *'), 'Monthly on the 22nd at 06:00 KST')
assert.equal(cronText('0 6 11 * *'), 'Monthly on the 11th at 06:00 KST')
for (const raw of ['DAY', '*/5 * * * *', '0 4-6 * * *', '0 4 * 1 *', '0 24 * * *', '0 4 1 * 1']) assert.equal(cronText(raw), raw) // never guessed

assert.equal(dailyHour('0 10 * * *'), 10)
assert.equal(dailyHour('0 2 * * *'), undefined) // the form doesn't offer 00-03
assert.equal(dailyHour('30 10 * * *'), undefined)
assert.equal(rangeLabel('LAST_2DAYS'), 'Last 2 days')
assert.equal(rangeLabel('YEAR'), 'YEAR')

// weighted by connections across projects: 10:00 / LAST_2DAYS (43) beats 04:00 / DAY (21); the bad "DAY" cron never wins
assert.deepEqual(scheduleDefaults(rows), { hour: 10, range: 'LAST_2DAYS' })
assert.deepEqual(scheduleDefaults(rows.slice(0, 1)), { hour: 4, range: 'DAY' })
assert.deepEqual(scheduleDefaults([]), { hour: 4, range: 'DAY' })
assert.deepEqual(scheduleDefaults([{ ...rows[3], connections: 99 }]), { hour: 4, range: 'DAY' })

const groups = byProject(rows)
assert.deepEqual(groups.map(g => [g.project, g.rows.length]), [['Sample Brand KR', 2], ['팀민트_크레이버', 2]])
console.log('schedule ok')
