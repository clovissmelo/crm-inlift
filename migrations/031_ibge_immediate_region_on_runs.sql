-- Região geográfica imediata (IBGE) por município na execução

ALTER TABLE lead_generation_municipalities
  ADD COLUMN IF NOT EXISTS ibge_immediate_region_id INTEGER,
  ADD COLUMN IF NOT EXISTS ibge_immediate_region_name TEXT;

ALTER TABLE lead_generation_run_municipalities
  ADD COLUMN IF NOT EXISTS ibge_immediate_region_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_lead_gen_muni_immediate_region
  ON lead_generation_municipalities (ibge_immediate_region_id)
  WHERE ibge_immediate_region_id IS NOT NULL;
