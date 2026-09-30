-- Matriz técnico × comercial com regras de finalização e etapa de funil

ALTER TABLE call_technical_result_types
  ADD COLUMN IF NOT EXISTS answered BOOLEAN NOT NULL DEFAULT false;

UPDATE call_technical_result_types SET answered = true WHERE slug = 'answered';
UPDATE call_technical_result_types SET answered = false WHERE slug <> 'answered';

CREATE TABLE IF NOT EXISTS result_registration_associations (
  id SERIAL PRIMARY KEY,
  call_technical_result_type_id INTEGER NOT NULL REFERENCES call_technical_result_types(id),
  commercial_result_type_id INTEGER NOT NULL REFERENCES approach_result_types(id),
  pipeline_stage_id INTEGER REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  collect_notes BOOLEAN,
  require_schedule_return BOOLEAN,
  require_final_registration BOOLEAN,
  ask_decision_maker BOOLEAN,
  mark_phone_verified BOOLEAN,
  allowed_next_actions JSONB,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (call_technical_result_type_id, commercial_result_type_id)
);

CREATE INDEX IF NOT EXISTS idx_result_reg_assoc_technical
  ON result_registration_associations (call_technical_result_type_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_result_reg_assoc_commercial
  ON result_registration_associations (commercial_result_type_id)
  WHERE status = 'active';

-- Não atendeu (todos os resultados técnicos exceto "answered") → Sem contato
INSERT INTO result_registration_associations (call_technical_result_type_id, commercial_result_type_id, status)
SELECT t.id, cr.id, 'active'
FROM call_technical_result_types t
JOIN approach_result_types cr ON cr.slug = 'sem_contato' AND cr.layer = 'commercial'
WHERE t.answered = false
ON CONFLICT (call_technical_result_type_id, commercial_result_type_id) DO NOTHING;

-- Atendeu → comerciais permitidos pelo vínculo contato × comercial (conversas)
INSERT INTO result_registration_associations (call_technical_result_type_id, commercial_result_type_id, status)
SELECT DISTINCT t.id, cc.commercial_result_type_id, 'active'
FROM call_technical_result_types t
JOIN contact_commercial_compat cc ON true
JOIN contact_outcome_types co ON co.id = cc.contact_outcome_type_id
WHERE t.answered = true
  AND co.slug IN ('falou_outra_pessoa', 'falou_responsavel')
ON CONFLICT (call_technical_result_type_id, commercial_result_type_id) DO NOTHING;
