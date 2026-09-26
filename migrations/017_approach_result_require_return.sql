ALTER TABLE approach_result_types
  ADD COLUMN IF NOT EXISTS require_schedule_return BOOLEAN NOT NULL DEFAULT false;

UPDATE approach_result_types SET require_schedule_return = true
  WHERE slug = 'pediu_retorno';
