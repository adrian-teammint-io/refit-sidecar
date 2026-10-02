-- Current sync schedules of the chosen projects' connections (sync_schedule: one row per connection, a daily cron in
-- KST plus a range), grouped so each project lists each schedule once with how many connections use it.
-- :projects is 1-50 UUIDs, bound by bindParams() in protocol.mjs. Connections without a schedule row aren't listed.
SELECT p.id AS project_id, p.name AS project, s.cron, s.range, count(*) AS connections
FROM sync_schedule s
JOIN connection c ON c.id = s.connection_id
JOIN project p ON p.id = c.project_id
WHERE c.project_id IN (:projects)
GROUP BY p.id, p.name, s.cron, s.range
ORDER BY p.name, p.id, connections DESC, s.cron
