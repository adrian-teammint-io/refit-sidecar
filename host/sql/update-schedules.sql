-- Sets one daily sync time and range on every scheduled connection of the chosen projects (the drawer's Sync schedule).
-- Same columns refit-gql's updateServiceConnection writes (cron, range, skip); the crawler re-reads sync_schedule
-- every hour, so nothing else needs updating. Connections without a schedule row stay without one.
-- :daily_cron is "0 H * * *" for H 4-23, :projects 1-50 UUIDs (bindParams). checkQuery() only lets this exact shape through.
UPDATE sync_schedule SET cron = :daily_cron, range = :range, skip = false, update_at = now() WHERE connection_id IN (SELECT id FROM connection WHERE project_id IN (:projects)) RETURNING connection_id
