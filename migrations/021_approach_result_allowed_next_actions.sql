-- Próximos passos permitidos por tipo de resultado comercial (JSON array de chaves).

ALTER TABLE approach_result_types
  ADD COLUMN IF NOT EXISTS allowed_next_actions JSONB;

UPDATE approach_result_types
SET allowed_next_actions = '["schedule_return"]'::jsonb
WHERE require_schedule_return = true;

UPDATE approach_result_types
SET allowed_next_actions = '["none", "schedule_return", "schedule_meeting", "pause", "close"]'::jsonb
WHERE allowed_next_actions IS NULL AND suggest_follow_up = true;

UPDATE approach_result_types
SET allowed_next_actions = '["none", "schedule_return", "schedule_meeting"]'::jsonb
WHERE allowed_next_actions IS NULL
  AND lead_qualification IN ('warm', 'hot');

UPDATE approach_result_types
SET allowed_next_actions = '["none"]'::jsonb
WHERE allowed_next_actions IS NULL;
