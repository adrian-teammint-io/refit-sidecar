SELECT c.id, c.project_id, c.name, c.type AS kind, sc.service, c.data_start, c.data_end,
  ls.status, ls.type AS sync_type,
  to_char(ls.update_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_sync,
  ls.reason, ls.display_reason,
  (SELECT count(*) FROM sync_request f WHERE f.connection_id = c.id AND f.status = 'FAIL') AS failed
FROM connection c
LEFT JOIN service_connection sc ON sc.id = c.service_connection_id
LEFT JOIN LATERAL (
  SELECT r.status, r.type, r.update_at, r.reason, r.display_reason
  FROM sync_request r WHERE r.connection_id = c.id ORDER BY r.create_at DESC LIMIT 1
) ls ON true
WHERE c.project_id = ':project_id'
ORDER BY (ls.status = 'FAIL') DESC NULLS LAST, c.name
LIMIT 1000
