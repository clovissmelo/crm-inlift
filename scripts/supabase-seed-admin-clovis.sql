-- Primeiro usuário (Supabase SQL Editor). Senha de login: 1234
-- Idempotente: não duplica se o e-mail já existir.

WITH ins AS (
  INSERT INTO users (name, email, status, password_hash, created_at)
  VALUES (
    'Clóvis Melo',
    'clovis@inlift.com.br',
    'active',
    '$2b$12$rw/2M6hWrO/VSbmFCeNht.ZmkFMh6z4QvYzJyN2qn9U9w/34E9Lnq',
    now()
  )
  ON CONFLICT (email) DO NOTHING
  RETURNING id
)
INSERT INTO user_roles (user_id, role)
SELECT ins.id, r.role
FROM ins
CROSS JOIN (VALUES ('bdr'), ('product_owner'), ('manager')) AS r(role);

SELECT id, email, name, status FROM users WHERE lower(email) = lower('clovis@inlift.com.br');
