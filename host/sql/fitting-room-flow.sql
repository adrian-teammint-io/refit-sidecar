-- Every node (transaction) of one fitting room with its inputs, for the drawer's Flow tab. Placeholders: bindParams() in protocol.mjs.
-- Edges are payload.from entries, the way refit-app-2 draws the canvas (components/diagram/Diagram.tsx): {type: 'transaction', id}
-- is an upstream node, {type: 'connection', id} a data source. `inputs` is JSON text ([{type, id, name}] in payload order;
-- name is null when the id no longer exists). One fetch, no batches: the row limit in commands.json caps it.
WITH tx AS (
  SELECT t.id, t.name, t.type::text AS type, t.payload FROM transaction t WHERE t.fitting_room_id = :fitting_room_id
), inputs AS (
  SELECT tx.id, jsonb_agg(jsonb_build_object('type', e ->> 'type', 'id', e ->> 'id', 'name', coalesce(up.name, c.name)) ORDER BY e_n) AS inputs
  FROM tx
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(tx.payload -> 'from') = 'array' THEN tx.payload -> 'from' ELSE '[]'::jsonb END) WITH ORDINALITY AS f(e, e_n)
  LEFT JOIN tx up ON e ->> 'type' = 'transaction' AND up.id::text = e ->> 'id'
  LEFT JOIN connection c ON e ->> 'type' = 'connection' AND c.id::text = e ->> 'id'
  GROUP BY tx.id
), outputs AS (
  SELECT DISTINCT ON (st.transaction_id) st.transaction_id, s.status, s.create_at
  FROM source_table st
  JOIN sync_request_fitdata s ON s.fitdata_id = st.id
  WHERE st.transaction_id IN (SELECT id FROM tx)
  ORDER BY st.transaction_id, s.create_at DESC
)
SELECT tx.id, tx.name, tx.type, coalesce(i.inputs, '[]'::jsonb)::text AS inputs,
  (SELECT count(*) FROM source_table st WHERE st.transaction_id = tx.id) AS outputs,
  o.status AS output_status,
  to_char(o.create_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS output_at
FROM tx
LEFT JOIN inputs i ON i.id = tx.id
LEFT JOIN outputs o ON o.transaction_id = tx.id
ORDER BY tx.name, tx.id
