-- Every sync_request with status :sync_status (FAIL | FRAGMENTED), or with OTHER every status but SUCCESS and FAIL
-- (IN_PROGRESS, READY, FRAGMENTED, CANCEL...). Order: IN_PROGRESS, READY, then the rest, each newest first; ranked before
-- the LIMIT, so hundreds of old CANCEL rows can't push the live ones out.
-- recovered_*: the newest later SUCCESS on the same connection that covers this row's end_date (the fish
-- refit-sync_success_after_fail rule); NULL when there is none or end_date is NULL.
-- sync_request has no index on connection_id, so SUCCESS rows are read in one pass (only the listed rows'
-- connections) and hash-joined, instead of a lookup per row.
WITH fails AS (
  SELECT id, connection_id, status, type, start_date, end_date, reason, display_reason, update_at, create_at,
    CASE status WHEN 'IN_PROGRESS' THEN 0 WHEN 'READY' THEN 1 ELSE 2 END AS rank
  FROM sync_request WHERE status = :sync_status OR (:sync_status = 'OTHER' AND status NOT IN ('SUCCESS', 'FAIL'))
  ORDER BY rank, update_at DESC LIMIT 500
), ok AS (
  SELECT DISTINCT ON (f.id) f.id, s.start_date, s.end_date, s.create_at
  FROM fails f
  JOIN sync_request s ON s.connection_id = f.connection_id AND s.status = 'SUCCESS'
    AND s.start_date <= f.end_date AND s.end_date >= f.end_date AND s.create_at > f.create_at
  ORDER BY f.id, s.create_at DESC
)
SELECT r.id, r.connection_id, c.project_id, p.name AS project, c.name, c.type AS kind, sc.service, r.type,
  r.start_date, r.end_date, r.reason, r.display_reason,
  to_char(r.update_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS update_at,
  ok.start_date AS recovered_start, ok.end_date AS recovered_end,
  to_char(ok.create_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS recovered_at, r.status
FROM fails r
JOIN connection c ON c.id = r.connection_id
JOIN project p ON p.id = c.project_id
LEFT JOIN service_connection sc ON sc.id = c.service_connection_id
LEFT JOIN ok ON ok.id = r.id
ORDER BY r.rank, r.update_at DESC
