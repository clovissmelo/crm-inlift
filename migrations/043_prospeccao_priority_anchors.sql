-- Âncoras na ordem da fila + parâmetros de regra + tipos de rodada de ligação.

ALTER TABLE prospeccao_priority_types
  ADD COLUMN IF NOT EXISTS queue_anchor TEXT NOT NULL DEFAULT 'none';

ALTER TABLE prospeccao_priority_types
  ADD COLUMN IF NOT EXISTS rule_params TEXT NULL;

UPDATE prospeccao_priority_types SET queue_anchor = 'none' WHERE queue_anchor IS NULL;

ALTER TABLE prospeccao_priority_types DROP CONSTRAINT IF EXISTS prospeccao_priority_types_queue_anchor_check;
ALTER TABLE prospeccao_priority_types
  ADD CONSTRAINT prospeccao_priority_types_queue_anchor_check
  CHECK (queue_anchor IN ('start', 'end', 'none'));

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
    'no_phone'
  ));

UPDATE prospeccao_priority_types
SET queue_anchor = 'start', sort_order = 1, updated_at = NOW()
WHERE slug = 'primeiro_contato';

UPDATE prospeccao_priority_types
SET queue_anchor = 'end', sort_order = 100000, rule_kind = 'return_due', updated_at = NOW()
WHERE slug = 'retorno';

UPDATE prospeccao_priority_types
SET queue_anchor = 'none', updated_at = NOW()
WHERE slug NOT IN ('primeiro_contato', 'retorno');

COMMENT ON COLUMN prospeccao_priority_types.queue_anchor IS 'start=primeiro contato fixo; end=retorno fixo; none=configurável no meio.';
COMMENT ON COLUMN prospeccao_priority_types.rule_params IS 'JSON, ex.: {"round":2} para dial_round_tier.';
