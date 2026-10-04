-- Garante papel administrador e menu completo no perfil Admin

INSERT INTO access_profile_role_grants (profile_id, role)
SELECT p.id, 'admin'
FROM access_profiles p
WHERE p.slug IN ('administrador', 'admin')
ON CONFLICT DO NOTHING;

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
WHERE p.slug IN ('administrador', 'admin')
ON CONFLICT DO NOTHING;
