-- Papéis administrativos por perfil de acesso (aba Administrativos)

CREATE TABLE IF NOT EXISTS access_profile_role_grants (
  profile_id BIGINT NOT NULL REFERENCES access_profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('bdr', 'product_owner', 'manager', 'admin')),
  PRIMARY KEY (profile_id, role)
);

INSERT INTO access_profiles (slug, name, description, access_rank, active) VALUES
  (
    'administrador',
    'Admin',
    'Administração geral da ferramenta.',
    100,
    true
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO access_profile_menu_grants (profile_id, menu_key)
SELECT p.id, k.menu_key
FROM access_profiles p
CROSS JOIN (
  VALUES
    ('dashboard'),
    ('prospeccao'),
    ('funil'),
    ('agendamentos'),
    ('novos_leads'),
    ('organizacao_leads'),
    ('clientes'),
    ('abordagens'),
    ('prospeccao_config'),
    ('resultado_comercial'),
    ('etapas_funil'),
    ('negocios_convertidos'),
    ('empresas'),
    ('produtos'),
    ('usuarios'),
    ('admin_hub')
) AS k(menu_key)
WHERE p.slug = 'administrador'
ON CONFLICT DO NOTHING;

INSERT INTO access_profile_role_grants (profile_id, role)
SELECT p.id, 'admin'
FROM access_profiles p
WHERE p.slug = 'administrador'
ON CONFLICT DO NOTHING;

INSERT INTO access_profile_role_grants (profile_id, role)
SELECT p.id, r.role
FROM access_profiles p
CROSS JOIN (
  VALUES ('bdr'), ('manager')
) AS r(role)
WHERE p.slug = 'gestao'
ON CONFLICT DO NOTHING;

INSERT INTO access_profile_role_grants (profile_id, role)
SELECT p.id, 'bdr'
FROM access_profiles p
WHERE p.slug = 'operacional'
ON CONFLICT DO NOTHING;
