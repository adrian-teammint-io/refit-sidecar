-- Search fitting rooms (data pipelines) across every project, newest edit first. Placeholders: bindParams() in protocol.mjs.
-- The batch is cut first (page), so node/output counts and the last fitdata sync only touch those 31 rooms.
WITH page AS (
  SELECT f.id, f.project_id, pr.name AS project, pr.status AS project_status, f.name, f.updated_at
  FROM fitting_room f
  JOIN project pr ON pr.id = f.project_id
  WHERE strpos(lower(f.name), lower(:q)) > 0 OR strpos(lower(pr.name), lower(:q)) > 0 OR strpos(lower(f.id::text), lower(:q)) > 0
  ORDER BY f.updated_at DESC, f.id
  LIMIT 31 OFFSET :offset -- BATCH + 1 (src/projects.ts)
), nodes AS (
  SELECT t.fitting_room_id, count(*) AS n FROM transaction t WHERE t.fitting_room_id IN (SELECT id FROM page) GROUP BY 1
), outputs AS (
  SELECT t.fitting_room_id, count(*) AS n, max(s.create_at) AS last_fit, count(*) FILTER (WHERE s.status <> 'SUCCESS') AS not_ok
  FROM source_table st
  JOIN transaction t ON t.id = st.transaction_id
  LEFT JOIN sync_request_fitdata s ON s.fitdata_id = st.id
  WHERE t.fitting_room_id IN (SELECT id FROM page) GROUP BY 1
)
SELECT p.id, p.project_id, p.project, p.project_status, p.name,
  coalesce(n.n, 0) AS nodes, coalesce(o.n, 0) AS outputs, coalesce(o.not_ok, 0) AS not_ok,
  to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
  to_char(o.last_fit AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_fit
FROM page p
LEFT JOIN nodes n ON n.fitting_room_id = p.id
LEFT JOIN outputs o ON o.fitting_room_id = p.id
ORDER BY p.updated_at DESC, p.id
