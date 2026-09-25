-- Diagnóstico rápido: o que existe de fato no banco (ignore schema_migrations)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'approaches',
    'client_approaches',
    'meetings',
    'pipeline_stages',
    'opportunity_proposals',
    'google_calendar_connection'
  )
ORDER BY 1;
