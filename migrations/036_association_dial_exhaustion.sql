-- Tentativas e esgotamento por associação (ligaçao × comercial)

ALTER TABLE result_registration_associations
  ADD COLUMN IF NOT EXISTS dial_counts_for_exhaustion BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dial_occurrence_kind TEXT CHECK (
    dial_occurrence_kind IS NULL OR dial_occurrence_kind IN (
      'no_answer', 'invalid', 'wrong_number', 'technical_fail', 'conversation_success'
    )
  ),
  ADD COLUMN IF NOT EXISTS dial_occurrence_limit INTEGER,
  ADD COLUMN IF NOT EXISTS dial_min_interval_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS dial_limit_action TEXT CHECK (
    dial_limit_action IS NULL OR dial_limit_action IN ('exhaust_phone', 'flag_review')
  );

ALTER TABLE client_phone_dial_state
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exhaustion_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_occurrence_kind TEXT;

ALTER TABLE phone_dial_attempts
  ADD COLUMN IF NOT EXISTS occurrence_kind TEXT,
  ADD COLUMN IF NOT EXISTS result_registration_association_id INTEGER REFERENCES result_registration_associations(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_phone_dial_attempts_approach
  ON phone_dial_attempts (approach_id)
  WHERE approach_id IS NOT NULL;

-- Padrões: não atendeu → sem contato; inválido; conversa válida não consome
UPDATE result_registration_associations a
SET
  dial_counts_for_exhaustion = true,
  dial_occurrence_kind = 'no_answer',
  dial_occurrence_limit = COALESCE(a.dial_occurrence_limit, 3),
  dial_min_interval_minutes = COALESCE(a.dial_min_interval_minutes, 60),
  dial_limit_action = COALESCE(a.dial_limit_action, 'exhaust_phone')
FROM call_technical_result_types t, approach_result_types cr
WHERE a.call_technical_result_type_id = t.id
  AND cr.id = a.commercial_result_type_id
  AND t.answered = false
  AND cr.slug = 'sem_contato'
  AND a.dial_counts_for_exhaustion = false;

UPDATE result_registration_associations a
SET
  dial_counts_for_exhaustion = true,
  dial_occurrence_kind = 'invalid',
  dial_occurrence_limit = COALESCE(a.dial_occurrence_limit, 3),
  dial_min_interval_minutes = COALESCE(a.dial_min_interval_minutes, 60),
  dial_limit_action = COALESCE(a.dial_limit_action, 'exhaust_phone')
FROM call_technical_result_types t
WHERE a.call_technical_result_type_id = t.id
  AND t.slug = 'invalid_number';

UPDATE result_registration_associations a
SET
  dial_counts_for_exhaustion = false,
  dial_occurrence_kind = 'conversation_success',
  dial_limit_action = NULL
FROM call_technical_result_types t, approach_result_types cr
WHERE a.call_technical_result_type_id = t.id
  AND cr.id = a.commercial_result_type_id
  AND t.answered = true
  AND cr.slug <> 'sem_contato';

UPDATE result_registration_associations a
SET
  dial_counts_for_exhaustion = true,
  dial_occurrence_kind = 'wrong_number',
  dial_occurrence_limit = COALESCE(a.dial_occurrence_limit, 3),
  dial_min_interval_minutes = COALESCE(a.dial_min_interval_minutes, 60),
  dial_limit_action = COALESCE(a.dial_limit_action, 'exhaust_phone')
FROM call_technical_result_types t, approach_result_types cr
WHERE a.call_technical_result_type_id = t.id
  AND cr.id = a.commercial_result_type_id
  AND t.answered = true
  AND cr.slug = 'sem_contato';

UPDATE result_registration_associations a
SET dial_counts_for_exhaustion = false, dial_occurrence_kind = 'technical_fail'
FROM call_technical_result_types t
WHERE a.call_technical_result_type_id = t.id
  AND t.slug = 'call_failed';
