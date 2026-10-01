-- Existing users matching an email or name, for "Add user" (same lookup as refit-app-2's ProjectMembersModal).
-- member_role is their role in this project if they're already in it. Never selects pwd or tokens.
SELECT
  u.id,
  u.email,
  u.name,
  r.role AS member_role
FROM refit_user u
LEFT JOIN refit_user_project_relation r ON r.user_id = u.id AND r.project_id = :project_id
WHERE strpos(lower(u.email), lower(:q)) > 0 OR strpos(lower(coalesce(u.name, '')), lower(:q)) > 0
ORDER BY u.email
LIMIT 10
