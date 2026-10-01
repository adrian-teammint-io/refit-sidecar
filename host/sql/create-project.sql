-- Creates a project, like refit-gql add_project (db/__init__.py), as one statement so it's all or nothing:
-- the project row, the owner (create_by) as admin plus the chosen members (DO NOTHING on duplicates), and for a
-- TRIAL plan the owner's had_trial flag, as add_project does. checkQuery() only lets this exact shape through.
WITH p AS (
  INSERT INTO project (name, create_by, status, plan, end_date)
  VALUES (:name, :user_id, :project_status, :plan, :end_date)
  RETURNING id
), m AS (
  INSERT INTO refit_user_project_relation (user_id, project_id, role)
  SELECT x.user_id, p.id, x.role FROM p, (SELECT :user_id::uuid AS user_id, 'admin'::text AS role UNION ALL SELECT * FROM :members AS v(user_id, role)) x
  ON CONFLICT (project_id, user_id) DO NOTHING
  RETURNING user_id
), t AS (
  UPDATE refit_user SET had_trial = true WHERE id = :user_id AND :plan = 'TRIAL'
  RETURNING id
)
SELECT p.id, (SELECT count(*) FROM m) AS members FROM p
