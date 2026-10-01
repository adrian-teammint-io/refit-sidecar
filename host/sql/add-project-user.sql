-- Adds an existing user to a project (the drawer's Add user; same row refit-app-2's admin modal inserts).
-- Already a member: nothing changes (DO NOTHING) and no row comes back, so a role is never changed by accident.
-- checkQuery() (protocol.mjs) only lets this exact statement shape through.
INSERT INTO refit_user_project_relation (user_id, project_id, role) VALUES (:user_id, :project_id, :role) ON CONFLICT (project_id, user_id) DO NOTHING RETURNING user_id, role
