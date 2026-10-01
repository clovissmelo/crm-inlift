-- Prospecção por cliente×produto, contador unificado sem contato, regras de atendimento, cliente oficial.

CREATE TABLE IF NOT EXISTS client_product_prospeccao (
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  in_prospeccao_queue BOOLEAN NOT NULL DEFAULT true,
  exit_reason TEXT,
  exited_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_cpp_queue ON client_product_prospeccao (product_id, in_prospeccao_queue)
  WHERE in_prospeccao_queue = true;

-- Backfill: espelha fila legada por par cliente×produto (não remove leads nem reclassifica abordagens).
INSERT INTO client_product_prospeccao (client_id, product_id, in_prospeccao_queue, exit_reason, exited_at)
SELECT cp.client_id, cp.product_id, c.in_prospeccao_queue, c.prospeccao_exit_reason, c.prospeccao_exited_at
FROM client_products cp
JOIN clients c ON c.id = cp.client_id
ON CONFLICT (client_id, product_id) DO NOTHING;

ALTER TABLE client_phone_dial_state
  ADD COLUMN IF NOT EXISTS cycle_no_contact_count INTEGER NOT NULL DEFAULT 0;

UPDATE client_phone_dial_state
SET cycle_no_contact_count = GREATEST(cycle_no_contact_count, cycle_no_answer_count)
WHERE cycle_no_contact_count < cycle_no_answer_count;

ALTER TABLE call_strategy_settings
  ADD COLUMN IF NOT EXISTS max_no_contact_attempts INTEGER NOT NULL DEFAULT 3;

UPDATE call_strategy_settings SET max_no_contact_attempts = COALESCE(max_no_contact_attempts, max_no_answer_attempts, 3)
WHERE id = 1;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS is_official_client BOOLEAN NOT NULL DEFAULT false;

-- Cliente oficial: backfill somente quem já tem oportunidade ganha (não altera histórico de abordagens).
UPDATE clients c SET is_official_client = true
WHERE EXISTS (SELECT 1 FROM opportunities o WHERE o.client_id = c.id AND o.outcome = 'won');

CREATE TABLE IF NOT EXISTS attendance_rules (
  id SERIAL PRIMARY KEY,
  answered BOOLEAN NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  operational_action TEXT NOT NULL CHECK (operational_action IN (
    'auto_no_contact',
    'sem_contato',
    'pediu_retorno',
    'demonstrou_interesse',
    'sem_interesse',
    'reuniao_agendada'
  )),
  pipeline_stage_id INTEGER REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  commercial_result_type_id INTEGER REFERENCES approach_result_types(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO attendance_rules (answered, name, slug, operational_action, sort_order, is_system, commercial_result_type_id)
SELECT false, 'Não atendeu (automático)', 'auto_no_contact', 'auto_no_contact', 5, true, NULL
WHERE NOT EXISTS (SELECT 1 FROM attendance_rules WHERE slug = 'auto_no_contact');

INSERT INTO attendance_rules (answered, name, slug, operational_action, sort_order, is_system, commercial_result_type_id, pipeline_stage_id)
SELECT true, cr.name, cr.slug,
  CASE cr.slug
    WHEN 'sem_contato' THEN 'sem_contato'
    WHEN 'pediu_retorno' THEN 'pediu_retorno'
    WHEN 'demonstrou_interesse' THEN 'demonstrou_interesse'
    WHEN 'sem_interesse' THEN 'sem_interesse'
    WHEN 'reuniao_agendada' THEN 'reuniao_agendada'
    ELSE 'sem_contato'
  END,
  cr.sort_order,
  true,
  cr.id,
  (SELECT a.pipeline_stage_id FROM result_registration_associations a
   JOIN call_technical_result_types t ON t.id = a.call_technical_result_type_id
   WHERE a.commercial_result_type_id = cr.id AND a.status = 'active' AND t.answered = true
   ORDER BY a.id LIMIT 1)
FROM approach_result_types cr
WHERE cr.layer = 'commercial' AND cr.status = 'active'
  AND cr.slug IN ('sem_contato', 'pediu_retorno', 'demonstrou_interesse', 'sem_interesse', 'reuniao_agendada')
ON CONFLICT (slug) DO NOTHING;

-- Etapas alinhadas ao funil operacional (insere se ainda não existirem)
INSERT INTO pipeline_stages (name, sort_order, color, status, kind)
SELECT v.name, v.sort_order, v.color, 'active', v.kind
FROM (VALUES
  ('Prospecção', 5, '#94a3b8', 'in_progress'),
  ('Interessados', 15, '#0ea5e9', 'in_progress'),
  ('Agendado', 10, '#6366f1', 'in_progress'),
  ('Cadastro/Proposta', 25, '#f59e0b', 'in_progress'),
  ('Fechamento', 35, '#a855f7', 'in_progress'),
  ('Convertido', 50, '#22c55e', 'won'),
  ('Perdido', 60, '#ef4444', 'lost')
) AS v(name, sort_order, color, kind)
WHERE NOT EXISTS (SELECT 1 FROM pipeline_stages ps WHERE lower(trim(ps.name)) = lower(trim(v.name)));

COMMENT ON TABLE attendance_rules IS 'Fonte admin de regras de atendimento; flags derivadas da ação operacional no código.';
COMMENT ON TABLE client_product_prospeccao IS 'Fila de prospecção por cliente e produto.';
