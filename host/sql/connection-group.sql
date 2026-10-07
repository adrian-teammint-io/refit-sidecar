-- A saved connection group's connections, by id (1-100), with the same columns as connections.sql so parseConnections
-- reads both. Groups live in the extension's storage only (src/groups.ts); this just refreshes their status.
WITH page AS (
  SELECT c.id, c.project_id, pr.name AS project, c.name, c.type, sc.service, c.data_start, c.data_end
  FROM connection c
  JOIN project pr ON pr.id = c.project_id
  LEFT JOIN service_connection sc ON sc.id = c.service_connection_id
  WHERE c.id IN (:ids)
), last AS (
  SELECT DISTINCT ON (r.connection_id) r.connection_id, r.status, r.type, r.update_at, r.reason, r.display_reason
  FROM sync_request r WHERE r.connection_id IN (SELECT id FROM page)
  ORDER BY r.connection_id, r.create_at DESC
), fails AS (
  SELECT r.connection_id, count(*) AS n FROM sync_request r
  WHERE r.status = 'FAIL' AND r.connection_id IN (SELECT id FROM page) GROUP BY r.connection_id
)
SELECT p.id, p.project_id, p.project, p.name, p.type AS kind, p.service, p.data_start, p.data_end,
  l.status, l.type AS sync_type,
  to_char(l.update_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_sync,
  l.reason, l.display_reason, coalesce(f.n, 0) AS failed
FROM page p
LEFT JOIN last l ON l.connection_id = p.id
LEFT JOIN fails f ON f.connection_id = p.id
ORDER BY p.name, p.id
