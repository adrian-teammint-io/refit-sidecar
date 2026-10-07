-- Marks the chosen sync_requests FAIL with reason "Manually mark as FAIL" (the drawer's Sync requests "Not SUCCESS nor
-- FAIL" tab, Mark all as FAIL). Only rows still neither SUCCESS nor FAIL change; display_reason is left as it is. :ids is
-- 1-100 UUIDs, bound by bindParams(); RETURNING tells the drawer which rows changed. checkQuery() (protocol.mjs) only lets
-- this exact statement shape through.
UPDATE sync_request SET status = 'FAIL', reason = 'Manually mark as FAIL', update_at = now() WHERE status NOT IN ('SUCCESS', 'FAIL') AND id IN (:ids) RETURNING id
