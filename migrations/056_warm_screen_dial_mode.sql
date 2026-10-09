-- Modo de discagem do aquecedor: silent (automático) ou assisted (operador + roteiro).
ALTER TABLE warm_screen_executions
  ADD COLUMN IF NOT EXISTS dial_mode TEXT NOT NULL DEFAULT 'silent';

ALTER TABLE warm_screen_executions
  DROP CONSTRAINT IF EXISTS warm_screen_executions_dial_mode_check;

ALTER TABLE warm_screen_executions
  ADD CONSTRAINT warm_screen_executions_dial_mode_check
  CHECK (dial_mode IN ('silent', 'assisted'));

COMMENT ON COLUMN warm_screen_executions.dial_mode IS
  'silent: hangup automático ao atender; assisted: pausa o motor e abre roteiro/discador para o operador.';
