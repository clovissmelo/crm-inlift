-- Três camadas: resultado técnico (telefonia), contato realizado (BDR), resultado comercial (BDR)

CREATE TABLE IF NOT EXISTS call_technical_result_types (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  provider_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_outcome_types (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  requires_conversation BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE approach_result_types
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS layer TEXT NOT NULL DEFAULT 'commercial',
  ADD COLUMN IF NOT EXISTS requires_meeting BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order_override INTEGER;

ALTER TABLE approach_result_types DROP CONSTRAINT IF EXISTS approach_result_types_layer_check;
ALTER TABLE approach_result_types
  ADD CONSTRAINT approach_result_types_layer_check
  CHECK (layer IN ('commercial', 'legacy_telephony'));

CREATE TABLE IF NOT EXISTS contact_commercial_compat (
  contact_outcome_type_id INTEGER NOT NULL REFERENCES contact_outcome_types(id) ON DELETE CASCADE,
  commercial_result_type_id INTEGER NOT NULL REFERENCES approach_result_types(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_outcome_type_id, commercial_result_type_id)
);

ALTER TABLE api4com_calls
  ADD COLUMN IF NOT EXISTS technical_result_type_id INTEGER REFERENCES call_technical_result_types(id),
  ADD COLUMN IF NOT EXISTS technical_provider_code TEXT,
  ADD COLUMN IF NOT EXISTS technical_provider_label TEXT,
  ADD COLUMN IF NOT EXISTS technical_inferred_at TIMESTAMPTZ;

ALTER TABLE approaches
  ADD COLUMN IF NOT EXISTS api4com_call_row_id INTEGER REFERENCES api4com_calls(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_outcome_type_id INTEGER REFERENCES contact_outcome_types(id),
  ADD COLUMN IF NOT EXISTS contact_outcome_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS commercial_result_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS technical_result_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS contacted_person_name TEXT,
  ADD COLUMN IF NOT EXISTS contacted_person_job_title TEXT,
  ADD COLUMN IF NOT EXISTS contacted_person_notes TEXT,
  ADD COLUMN IF NOT EXISTS linked_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS registration_status TEXT NOT NULL DEFAULT 'final'
    CHECK (registration_status IN ('draft', 'final'));

CREATE INDEX IF NOT EXISTS idx_approaches_api4com_call_row ON approaches (api4com_call_row_id);
CREATE INDEX IF NOT EXISTS idx_api4com_calls_technical_result ON api4com_calls (technical_result_type_id);

-- Resultado técnico normalizado (mapeamento administrável)
INSERT INTO call_technical_result_types (slug, display_name, provider_rules, sort_order) VALUES
  ('answered', 'Atendeu', '[{"kind":"answered"}]'::jsonb, 10),
  ('no_answer', 'Não atendeu', '[{"codes":["18","19","480"],"labels":["NO_ANSWER","NO_USER_RESPONSE","SUBSCRIBER_ABSENT","ALLOTTED_TIMEOUT","RECOVERY_ON_TIMER"]}]'::jsonb, 20),
  ('busy', 'Ocupado', '[{"codes":["17","486"],"labels":["USER_BUSY","BUSY"]}]'::jsonb, 30),
  ('invalid_number', 'Número inválido', '[{"codes":["404","484","604"],"labels":["NUMBER_CHANGED","UNALLOCATED","INVALID_NUMBER","INVALID_NUMBER_FORMAT","NO_ROUTE","NOT_FOUND","UNASSIGNED_NUMBER","DESTINATION_OUT_OF_ORDER","INVALID_GATEWAY"]}]'::jsonb, 40),
  ('call_failed', 'Falha na ligação', '[{"codes":["21","487"],"labels":["ORIGINATOR_CANCEL","LOSE_RACE","CALL_REJECTED","REQUEST_TERMINATED"],"unanswered_only":true}]'::jsonb, 50)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO contact_outcome_types (slug, name, description, sort_order, requires_conversation) VALUES
  ('nenhum_contato', 'Nenhum contato', 'Caixa postal, URA ou atendimento sem conversa com pessoa.', 10, false),
  ('falou_outra_pessoa', 'Falou com outra pessoa', 'Conversa com alguém que não é o responsável pela decisão.', 20, true),
  ('falou_responsavel', 'Falou com o responsável', 'Conversa com quem decide ou é o contato principal.', 30, true)
ON CONFLICT (slug) DO NOTHING;

-- Novo resultado comercial "Sem contato"
INSERT INTO approach_result_types (slug, name, status, suggest_follow_up, lead_qualification, collect_notes, require_schedule_return, require_final_registration, layer, description, sort_order)
VALUES ('sem_contato', 'Sem contato', 'active', false, 'cold', false, false, true, 'commercial', 'Não houve conversa com pessoa.', 5)
ON CONFLICT (slug) DO NOTHING;

UPDATE approach_result_types SET layer = 'legacy_telephony', status = 'inactive'
WHERE slug IN ('nao_atendeu', 'chamou_sem_resposta', 'numero_invalido', 'falou_outra_pessoa', 'falou_responsavel');

UPDATE approach_result_types SET layer = 'commercial', description = COALESCE(description, name)
WHERE slug IN ('sem_contato', 'sem_interesse', 'pediu_retorno', 'demonstrou_interesse', 'reuniao_agendada');

UPDATE approach_result_types SET requires_meeting = true WHERE slug = 'reuniao_agendada';
UPDATE approach_result_types SET require_schedule_return = true WHERE slug = 'pediu_retorno';
UPDATE approach_result_types SET collect_notes = true WHERE slug IN ('sem_interesse', 'pediu_retorno', 'demonstrou_interesse');

-- Compatibilidade contato × comercial (por slug)
INSERT INTO contact_commercial_compat (contact_outcome_type_id, commercial_result_type_id)
SELECT co.id, cr.id
FROM contact_outcome_types co
CROSS JOIN approach_result_types cr
WHERE co.slug = 'nenhum_contato' AND cr.slug = 'sem_contato'
ON CONFLICT DO NOTHING;

INSERT INTO contact_commercial_compat (contact_outcome_type_id, commercial_result_type_id)
SELECT co.id, cr.id
FROM contact_outcome_types co
JOIN approach_result_types cr ON cr.slug IN ('sem_interesse', 'pediu_retorno', 'demonstrou_interesse', 'reuniao_agendada', 'sem_contato')
WHERE co.slug = 'falou_outra_pessoa'
ON CONFLICT DO NOTHING;

INSERT INTO contact_commercial_compat (contact_outcome_type_id, commercial_result_type_id)
SELECT co.id, cr.id
FROM contact_outcome_types co
JOIN approach_result_types cr ON cr.slug IN ('sem_interesse', 'pediu_retorno', 'demonstrou_interesse', 'reuniao_agendada')
WHERE co.slug = 'falou_responsavel'
ON CONFLICT DO NOTHING;
