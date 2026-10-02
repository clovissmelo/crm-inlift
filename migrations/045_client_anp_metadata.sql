-- Metadados ANP / geração de leads fora do campo notes (texto livre do usuário).

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS lead_generation_run_id BIGINT REFERENCES lead_generation_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS google_place_id TEXT,
  ADD COLUMN IF NOT EXISTS anp_fuel_brand TEXT,
  ADD COLUMN IF NOT EXISTS anp_white_flag BOOLEAN,
  ADD COLUMN IF NOT EXISTS anp_products_summary TEXT;

CREATE INDEX IF NOT EXISTS idx_clients_lead_gen_run ON clients (lead_generation_run_id)
  WHERE lead_generation_run_id IS NOT NULL;

-- Extrai metadados já colados em notes por versões antigas do motor de leads.
UPDATE clients
SET
  lead_generation_run_id = COALESCE(
    lead_generation_run_id,
    (regexp_match(notes, 'Origem:\s*geração de leads\s*#(\d+)', 'i'))[1]::bigint
  ),
  google_place_id = COALESCE(
    google_place_id,
    (regexp_match(notes, 'Google Place ID:\s*(\S+)', 'i'))[1]
  ),
  anp_products_summary = COALESCE(
    anp_products_summary,
    NULLIF(trim(substring(notes from 'Produtos ANP:\s*(.+)$')), ''),
    NULLIF(trim(substring(notes from 'Produtos ANP:\s*(.+)')), '')
  )
WHERE notes IS NOT NULL
  AND (
    notes ~* 'Origem:\s*geração de leads\s*#'
    OR notes ~* 'Google Place ID:'
    OR notes ~* 'Produtos ANP:'
  );

-- Remove blocos de sistema de notes, mantendo texto livre antes/depois (se houver).
UPDATE clients
SET notes = NULLIF(
  trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          coalesce(notes, ''),
          'Origem:\s*geração de leads\s*#\d+\s*',
          '',
          'gi'
        ),
        'Google Place ID:\s*\S+\s*',
        '',
        'gi'
      ),
      'Produtos ANP:\s*.+\s*',
      '',
      'gi'
    )
  ),
  ''
)
WHERE notes IS NOT NULL
  AND (
    notes ~* 'Origem:\s*geração de leads\s*#'
    OR notes ~* 'Google Place ID:'
    OR notes ~* 'Produtos ANP:'
  );
