-- Pediu retorno: etapa configurável; padrão Prospecção quando ainda nulo.

UPDATE attendance_rules ar
SET pipeline_stage_id = ps.id,
    updated_at = NOW()
FROM pipeline_stages ps
WHERE ar.pipeline_stage_id IS NULL
  AND ar.answered = true
  AND ar.operational_action = 'pediu_retorno'
  AND lower(trim(ps.name)) = lower(trim('Prospecção'))
  AND ps.status = 'active';
