-- Concede perfil admin (rode após migrations/007_admin_role_and_settings.sql)
INSERT INTO user_roles (user_id, role)
SELECT u.id, 'admin'
FROM users u
WHERE lower(u.email) = lower('clovis@inlift.com.br')
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin'
  );

SELECT u.email, array_agg(ur.role ORDER BY ur.role) AS roles
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
WHERE lower(u.email) = lower('clovis@inlift.com.br')
GROUP BY u.email;
