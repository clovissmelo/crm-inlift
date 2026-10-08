INSERT INTO access_profile_menu_grants (profile_id, menu_key)
SELECT p.id, 'simulador_script'
FROM access_profiles p
WHERE p.slug IN ('administrador', 'admin', 'gestao', 'operacional', 'bdr')
ON CONFLICT DO NOTHING;
