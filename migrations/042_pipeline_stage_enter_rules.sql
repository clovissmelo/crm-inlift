-- Ações ao entrar na etapa (movimento manual no funil).

ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS enter_collect_notes BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS enter_allowed_next_actions TEXT NULL;

ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS enter_require_next_action BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN pipeline_stages.enter_collect_notes IS 'Ao mover negócio para esta etapa, pedir observação.';
COMMENT ON COLUMN pipeline_stages.enter_allowed_next_actions IS 'JSON: próximos passos permitidos (schedule_return, schedule_meeting, pause).';
COMMENT ON COLUMN pipeline_stages.enter_require_next_action IS 'Exige escolher um próximo passo ao entrar na etapa.';
