-- Permite excluir etapa do funil sem apagar histórico de movimentações (FK anula referência).
ALTER TABLE opportunity_stage_logs ALTER COLUMN to_stage_id DROP NOT NULL;

ALTER TABLE opportunity_stage_logs DROP CONSTRAINT IF EXISTS opportunity_stage_logs_to_stage_id_fkey;

ALTER TABLE opportunity_stage_logs
  ADD CONSTRAINT opportunity_stage_logs_to_stage_id_fkey
  FOREIGN KEY (to_stage_id) REFERENCES pipeline_stages(id) ON DELETE SET NULL;
