-- Deletes the chosen FAIL sync_requests (the drawer's Failed syncs selection; same as fish refit-sync_delete).
-- :ids is 1-100 UUIDs, bound by bindParams(). Rows that are no longer FAIL are left alone. RETURNING tells the
-- drawer which rows actually went. checkQuery() (protocol.mjs) only lets this exact statement shape through.
DELETE FROM sync_request WHERE status = 'FAIL' AND id IN (:ids) RETURNING id
