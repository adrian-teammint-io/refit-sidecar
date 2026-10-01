SELECT p.id, p.name, p.status, p.plan,
  (SELECT count(*) FROM connection c WHERE c.project_id = p.id) AS connections,
  (SELECT count(*) FROM sync_request r JOIN connection c ON c.id = r.connection_id WHERE c.project_id = p.id AND r.status = 'FAIL') AS failed,
  (SELECT to_char(max(r.update_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM sync_request r JOIN connection c ON c.id = r.connection_id WHERE c.project_id = p.id) AS last_sync
FROM project p
ORDER BY p.name
LIMIT 1000
