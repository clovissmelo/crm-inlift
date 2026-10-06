-- Motor de aquecimento de leads (triagem telefônica)

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS warm_screen_confirmed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN clients.warm_screen_confirmed_at IS
  'Preenchido quando o lead atendeu uma ligação do motor de aquecimento (prioridade Aquecido).';

ALTER TABLE prospeccao_priority_types DROP CONSTRAINT IF EXISTS prospeccao_priority_types_rule_kind_check;
ALTER TABLE prospeccao_priority_types
  ADD CONSTRAINT prospeccao_priority_types_rule_kind_check
  CHECK (rule_kind IN (
    'first_contact',
    'dial_round_tier',
    'overdue_return',
    'return_due',
    'scheduled_return',
    'has_approach',
    'no_phone',
    'warm_confirmed'
  ));

INSERT INTO prospeccao_priority_types (slug, name, description, color, sort_order, rule_kind, is_system, queue_anchor)
VALUES (
  'aquecido',
  'Aquecido',
  'Atendeu ligação do motor de aquecimento de leads.',
  '#ea580c',
  8,
  'warm_confirmed',
  true,
  'none'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  rule_kind = EXCLUDED.rule_kind,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS warm_screen_executions (
  id BIGSERIAL PRIMARY KEY,
  runner_user_id INTEGER NOT NULL REFERENCES users(id),
  dial_user_id INTEGER NOT NULL REFERENCES users(id),
  filters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'paused', 'stopped', 'completed', 'failed')),
  paused_at TIMESTAMPTZ NULL,
  stopped_at TIMESTAMPTZ NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ NULL,
  last_call_ended_at TIMESTAMPTZ NULL,
  items_total INTEGER NOT NULL DEFAULT 0,
  items_done INTEGER NOT NULL DEFAULT 0,
  items_warmed INTEGER NOT NULL DEFAULT 0,
  items_skipped INTEGER NOT NULL DEFAULT 0,
  items_error INTEGER NOT NULL DEFAULT 0,
  current_item_id BIGINT NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warm_screen_executions_runner_status
  ON warm_screen_executions (runner_user_id, status);

CREATE TABLE IF NOT EXISTS warm_screen_execution_items (
  id BIGSERIAL PRIMARY KEY,
  execution_id BIGINT NOT NULL REFERENCES warm_screen_executions(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'skipped', 'dialing', 'completed_error', 'completed_warmed', 'failed')),
  skip_reason TEXT NULL,
  phone_dialed TEXT NULL,
  contact_id INTEGER NULL REFERENCES contacts(id) ON DELETE SET NULL,
  product_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  api4com_call_row_id INTEGER NULL REFERENCES api4com_calls(id) ON DELETE SET NULL,
  error_message TEXT NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (execution_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_warm_screen_items_execution
  ON warm_screen_execution_items (execution_id, sort_order);

INSERT INTO access_profile_menu_grants (profile_id, menu_key)
SELECT p.id, 'aquecedor_leads'
FROM access_profiles p
WHERE p.slug IN ('administrador', 'admin', 'gestao', 'operacional')
ON CONFLICT DO NOTHING;

INSERT INTO access_profile_menu_grants (profile_id, menu_key)
SELECT p.id, 'aquecedor_leads'
FROM access_profiles p
WHERE p.slug = 'gestao'
ON CONFLICT DO NOTHING;
