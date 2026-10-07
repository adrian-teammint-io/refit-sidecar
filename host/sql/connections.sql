-- Search connections across every project, one batch at a time, newest sync status first: FAIL, IN_PROGRESS,
-- FRAGMENTED, SUCCESS, then the rest (never synced...), each by name. Placeholders: bindParams() in protocol.mjs.
-- The order needs every match's newest sync_request before the batch is cut; sync_request has no index on
-- connection_id, so that is one hash-joined pass over it (the per-batch version scanned it too).
WITH matches AS (
  SELECT c.id, c.project_id, pr.name AS project, c.name, c.type, sc.service, c.data_start, c.data_end
  FROM connection c
  JOIN project pr ON pr.id = c.project_id
  LEFT JOIN service_connection sc ON sc.id = c.service_connection_id
  WHERE (:platform = 'all' OR coalesce(sc.service, c.type)::text = :platform) -- platform() in src/failed-syncs.ts
    AND (strpos(lower(c.name), lower(:q)) > 0 OR strpos(lower(coalesce(sc.service, c.type)), lower(:q)) > 0 OR strpos(lower(c.id::text), lower(:q)) > 0)
), last AS (
  SELECT DISTINCT ON (r.connection_id) r.connection_id, r.status, r.type, r.update_at, r.reason, r.display_reason
  FROM sync_request r JOIN matches m ON m.id = r.connection_id
  ORDER BY r.connection_id, r.create_at DESC
), page AS (
  SELECT m.*, l.status, l.type AS sync_type, l.update_at, l.reason, l.display_reason,
    CASE l.status WHEN 'FAIL' THEN 0 WHEN 'IN_PROGRESS' THEN 1 WHEN 'FRAGMENTED' THEN 2 WHEN 'SUCCESS' THEN 3 ELSE 4 END AS rank -- statusRank() in src/failed-syncs.ts
  FROM matches m
  LEFT JOIN last l ON l.connection_id = m.id
  ORDER BY rank, m.name, m.id
  LIMIT 31 OFFSET :offset -- BATCH + 1 (src/projects.ts)
), fails AS (
  SELECT r.connection_id, count(*) AS n FROM sync_request r
  WHERE r.status = 'FAIL' AND r.connection_id IN (SELECT id FROM page) GROUP BY r.connection_id
)
SELECT p.id, p.project_id, p.project, p.name, p.type AS kind, p.service, p.data_start, p.data_end,
  p.status, p.sync_type,
  to_char(p.update_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_sync,
  p.reason, p.display_reason, coalesce(f.n, 0) AS failed
FROM page p
LEFT JOIN fails f ON f.connection_id = p.id
ORDER BY p.rank, p.name, p.id
