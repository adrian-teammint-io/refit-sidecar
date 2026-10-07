-- Deletes the chosen sync_requests that are neither SUCCESS nor FAIL (the drawer's Sync requests "Not SUCCESS nor FAIL"
-- tab: IN_PROGRESS, READY, FRAGMENTED, CANCEL...). Rows that became SUCCESS or FAIL meanwhile are left alone. A sync
-- still running in the crawler loses its row and its final status update finds nothing (refit-crawler
-- app_common.run_common, set_status by id); a READY one never runs. :ids is 1-100 UUIDs, bound by bindParams();
-- RETURNING tells the drawer which rows went. checkQuery() (protocol.mjs) only lets this exact statement shape through.
DELETE FROM sync_request WHERE status NOT IN ('SUCCESS', 'FAIL') AND id IN (:ids) RETURNING id
