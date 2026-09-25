-- Registra migrações já aplicadas manualmente (nomes devem bater com os arquivos em migrations/)
INSERT INTO schema_migrations (id) VALUES
  ('001_initial.sql'),
  ('002_funon_abordagens_retornos.sql'),
  ('003_meetings_google.sql'),
  ('004_opportunities_pipeline.sql'),
  ('005_fix_004_backfill.sql')
ON CONFLICT (id) DO NOTHING;
