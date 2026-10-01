-- A project's members (refit_user_project_relation), admins first. Never selects pwd or tokens.
SELECT
  u.id,
  u.email,
  u.name,
  r.role,
  to_char(r.create_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS added_at
FROM refit_user_project_relation r
JOIN refit_user u ON u.id = r.user_id
WHERE r.project_id = :project_id
ORDER BY CASE r.role WHEN 'admin' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, u.email
LIMIT 200
