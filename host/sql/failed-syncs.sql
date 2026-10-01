SELECT r.id, r.connection_id, c.project_id, p.name AS project, c.name, c.type AS kind, sc.service, r.type,
  r.start_date, r.end_date, r.reason, r.display_reason,
  to_char(r.update_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS update_at
FROM sync_request r
JOIN connection c ON c.id = r.connection_id
JOIN project p ON p.id = c.project_id
LEFT JOIN service_connection sc ON sc.id = c.service_connection_id
WHERE r.status = 'FAIL'
ORDER BY r.update_at DESC
LIMIT 500
