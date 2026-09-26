-- Exibir campo de observações ao registrar abordagem (configurável por tipo de resultado)

ALTER TABLE approach_result_types
  ADD COLUMN IF NOT EXISTS collect_notes BOOLEAN NOT NULL DEFAULT true;

UPDATE approach_result_types SET collect_notes = false
  WHERE slug IN ('nao_atendeu', 'chamou_sem_resposta', 'numero_invalido');
