-- Creates a project and its members in one statement, so it's all or nothing: the project row, then the owner
-- (create_by) as admin plus the chosen members (DO NOTHING on duplicates). Returns one row per member added; the
-- count is checked against the members sent. :members expands to ", ('<uuid>'::uuid, '<role>')" per member.
-- checkQuery() only lets this exact shape through.
WITH p AS (
  INSERT INTO project (name, create_by, status, plan, end_date)
  VALUES (:name, :user_id, :project_status, :plan, :end_date)
  RETURNING id
)
INSERT INTO refit_user_project_relation (user_id, project_id, role)
SELECT u.user_id, p.id, u.role
FROM p, (VALUES
  (:user_id::uuid, 'admin'::text):members
) AS u (user_id, role)
ON CONFLICT (user_id, project_id) DO NOTHING
RETURNING project_id, user_id
