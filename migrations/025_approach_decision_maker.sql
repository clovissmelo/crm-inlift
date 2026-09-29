-- Pergunta sobre decisor no resultado comercial e resposta na abordagem

ALTER TABLE approach_result_types
  ADD COLUMN IF NOT EXISTS ask_decision_maker BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE approaches
  ADD COLUMN IF NOT EXISTS spoke_with_decision_maker BOOLEAN;
