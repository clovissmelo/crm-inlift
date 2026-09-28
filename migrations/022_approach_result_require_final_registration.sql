ALTER TABLE approach_result_types
  ADD COLUMN IF NOT EXISTS require_final_registration BOOLEAN NOT NULL DEFAULT true;

UPDATE approach_result_types
SET require_final_registration = false
WHERE slug IN ('numero_invalido', 'chamou_sem_resposta');
