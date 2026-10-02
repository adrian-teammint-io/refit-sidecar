-- One batch of the connections a fitting room reads, each with its newest sync_request. Placeholders: bindParams() in protocol.mjs.
-- A room uses a connection when one of its transactions lists it in payload.from as {type: 'connection', id}, the
-- same link refit-gql checks before deleting a connection (src/db/__init__.py). Columns match project-connections.sql.
WITH used AS (
  SELECT DISTINCT e ->> 'id' AS id
  FROM transaction t,
    jsonb_array_elements(CASE WHEN jsonb_typeof(t.payload -> 'from') = 'array' THEN t.payload -> 'from' ELSE '[]'::jsonb END) e
  WHERE t.fitting_room_id = :fitting_room_id AND e ->> 'type' = 'connection'
), page AS (
  SELECT c.id, c.project_id, c.name, c.type, c.service_connection_id, c.data_start, c.data_end
  FROM connection c
  LEFT JOIN service_connection sc ON sc.id = c.service_connection_id
  WHERE c.id::text IN (SELECT id FROM used)
    AND (strpos(lower(c.name), lower(:q)) > 0 OR strpos(lower(coalesce(sc.service, c.type)), lower(:q)) > 0)
), last AS (
  SELECT DISTINCT ON (r.connection_id) r.connection_id, r.status, r.type, r.update_at, r.reason, r.display_reason
  FROM sync_request r WHERE r.connection_id IN (SELECT id FROM page)
  ORDER BY r.connection_id, r.create_at DESC
), fails AS (
  SELECT r.connection_id, count(*) AS n FROM sync_request r
  WHERE r.status = 'FAIL' AND r.connection_id IN (SELECT id FROM page) GROUP BY r.connection_id
)
SELECT p.id, p.project_id, p.name, p.type AS kind, sc.service, p.data_start, p.data_end,
  l.status, l.type AS sync_type,
  to_char(l.update_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_sync,
  l.reason, l.display_reason, coalesce(f.n, 0) AS failed
FROM page p
LEFT JOIN service_connection sc ON sc.id = p.service_connection_id
LEFT JOIN last l ON l.connection_id = p.id
LEFT JOIN fails f ON f.connection_id = p.id
ORDER BY
  CASE WHEN :sort = 'status' THEN (l.status = 'FAIL') END DESC NULLS LAST,
  CASE WHEN :sort = 'service' THEN coalesce(sc.service, p.type) END,
  p.name, p.id
LIMIT 31 OFFSET :offset -- BATCH + 1 (src/projects.ts)
