-- Prioridades operacionais configuráveis + estratégia de tentativas por telefone

CREATE TABLE IF NOT EXISTS prospeccao_priority_types (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#64748b',
  sort_order INTEGER NOT NULL DEFAULT 0,
  rule_kind TEXT NOT NULL CHECK (rule_kind IN ('overdue_return', 'scheduled_return', 'has_approach', 'first_contact')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  is_system BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO prospeccao_priority_types (slug, name, description, color, sort_order, rule_kind, is_system) VALUES
  ('reagendar', 'Reagendar', 'Retorno pendente com data/hora já passada.', '#dc2626', 10, 'overdue_return', true),
  ('retorno', 'Retorno', 'Retorno pendente agendado (hoje ou futuro).', '#2563eb', 20, 'scheduled_return', true),
  ('acompanhamento', 'Acompanhamento', 'Já houve abordagem; sem retorno pendente.', '#ca8a04', 30, 'has_approach', true),
  ('primeiro_contato', 'Primeiro contato', 'Nenhuma abordagem registrada ainda.', '#64748b', 40, 'first_contact', true)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS call_strategy_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  max_no_answer_attempts INTEGER NOT NULL DEFAULT 3,
  max_invalid_attempts INTEGER NOT NULL DEFAULT 3,
  max_wrong_number_attempts INTEGER NOT NULL DEFAULT 3,
  min_interval_minutes INTEGER NOT NULL DEFAULT 60,
  round_interval_hours INTEGER NOT NULL DEFAULT 24,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO call_strategy_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS call_strategy_result_rules (
  id SERIAL PRIMARY KEY,
  bucket TEXT NOT NULL CHECK (bucket IN ('no_answer', 'invalid', 'wrong_number', 'technical_fail', 'conversation_success')),
  technical_slug TEXT,
  commercial_slug TEXT,
  contact_outcome_slug TEXT,
  consumes_attempt BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  UNIQUE (bucket, technical_slug, commercial_slug, contact_outcome_slug)
);

INSERT INTO call_strategy_result_rules (bucket, technical_slug, consumes_attempt, sort_order) VALUES
  ('technical_fail', 'call_failed', false, 5),
  ('invalid', 'invalid_number', true, 10),
  ('no_answer', 'no_answer', true, 20),
  ('no_answer', 'busy', true, 21),
  ('conversation_success', 'answered', false, 30)
ON CONFLICT DO NOTHING;

INSERT INTO call_strategy_result_rules (bucket, commercial_slug, consumes_attempt, sort_order) VALUES
  ('conversation_success', 'reuniao_agendada', false, 40),
  ('conversation_success', 'demonstrou_interesse', false, 41),
  ('conversation_success', 'pediu_retorno', false, 42),
  ('conversation_success', 'sem_interesse', false, 43)
ON CONFLICT DO NOTHING;

INSERT INTO call_strategy_result_rules (bucket, contact_outcome_slug, consumes_attempt, sort_order) VALUES
  ('wrong_number', 'falou_outra_pessoa', true, 50)
ON CONFLICT DO NOTHING;

INSERT INTO call_strategy_result_rules (bucket, commercial_slug, contact_outcome_slug, consumes_attempt, sort_order) VALUES
  ('wrong_number', 'sem_contato', 'falou_outra_pessoa', true, 49)
ON CONFLICT DO NOTHING;

-- Telefone normalizado por cliente (contadores compartilhados entre contatos/fontes)
CREATE TABLE IF NOT EXISTS client_phones (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  phone_digits TEXT NOT NULL,
  display_phone TEXT,
  origin TEXT,
  primary_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, phone_digits)
);

CREATE INDEX IF NOT EXISTS idx_client_phones_client ON client_phones (client_id);

CREATE TABLE IF NOT EXISTS client_phone_dial_state (
  client_phone_id INTEGER PRIMARY KEY REFERENCES client_phones(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'waiting', 'exhausted')),
  cycle_no_answer_count INTEGER NOT NULL DEFAULT 0,
  cycle_invalid_count INTEGER NOT NULL DEFAULT 0,
  cycle_wrong_number_count INTEGER NOT NULL DEFAULT 0,
  next_eligible_at TIMESTAMPTZ,
  exhausted_at TIMESTAMPTZ,
  reactivated_at TIMESTAMPTZ,
  reactivated_by_user_id INTEGER REFERENCES users(id),
  reactivation_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS phone_dial_attempts (
  id SERIAL PRIMARY KEY,
  client_phone_id INTEGER NOT NULL REFERENCES client_phones(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  api4com_call_id INTEGER REFERENCES api4com_calls(id) ON DELETE SET NULL,
  approach_id INTEGER REFERENCES approaches(id) ON DELETE SET NULL,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  attempt_bucket TEXT NOT NULL,
  consumes_cycle BOOLEAN NOT NULL DEFAULT false,
  technical_slug TEXT,
  commercial_slug TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_phone_dial_attempts_call
  ON phone_dial_attempts (api4com_call_id)
  WHERE api4com_call_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_phone_dial_attempts_phone ON phone_dial_attempts (client_phone_id, created_at DESC);

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS prospeccao_exit_reason TEXT,
  ADD COLUMN IF NOT EXISTS prospeccao_exited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prospeccao_phone_summary TEXT;

COMMENT ON COLUMN clients.prospeccao_exit_reason IS 'Motivo de saída da fila (ex.: phones_exhausted, commercial_close).';
COMMENT ON COLUMN clients.prospeccao_phone_summary IS 'Resumo cache ex.: 2 de 4 números tentados.';
