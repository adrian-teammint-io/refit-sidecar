-- One batch of projects. Placeholders are filled by bindParams() in protocol.mjs (typed, never raw text).
-- sync_request has no index on connection_id, so its stats are aggregated in one pass instead of per row.
WITH conns AS (
  SELECT project_id, count(*) AS n FROM connection GROUP BY project_id
), stats AS (
  SELECT c.project_id, count(*) FILTER (WHERE r.status = 'FAIL') AS failed, max(r.update_at) AS last_sync
  FROM sync_request r JOIN connection c ON c.id = r.connection_id GROUP BY c.project_id
)
SELECT p.id, p.name, p.status, p.plan, coalesce(n.n, 0) AS connections, coalesce(s.failed, 0) AS failed,
  to_char(s.last_sync AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_sync
FROM project p
LEFT JOIN conns n ON n.project_id = p.id
LEFT JOIN stats s ON s.project_id = p.id
WHERE (:status = 'all' OR p.status = :status)
  AND (strpos(lower(p.name), lower(:q)) > 0 OR strpos(lower(p.id::text), lower(:q)) > 0 OR strpos(lower(coalesce(p.plan, '')), lower(:q)) > 0)
ORDER BY
  CASE WHEN :sort = 'active' THEN (p.status = 'ACTIVE') END DESC,
  CASE WHEN :sort = 'recent' THEN s.last_sync END DESC NULLS LAST,
  p.name, p.id
LIMIT 31 OFFSET :offset -- BATCH + 1 (src/projects.ts): the extra row only says "there is more"
