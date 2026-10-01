-- Preenche etapa do funil nas regras comerciais (answered) quando ainda nulo.

UPDATE attendance_rules ar
SET pipeline_stage_id = ps.id,
    updated_at = NOW()
FROM pipeline_stages ps
WHERE ar.pipeline_stage_id IS NULL
  AND ar.answered = true
  AND ar.operational_action = 'demonstrou_interesse'
  AND lower(trim(ps.name)) = lower(trim('Interessados'))
  AND ps.status = 'active';

UPDATE attendance_rules ar
SET pipeline_stage_id = ps.id,
    updated_at = NOW()
FROM pipeline_stages ps
WHERE ar.pipeline_stage_id IS NULL
  AND ar.answered = true
  AND ar.operational_action = 'reuniao_agendada'
  AND lower(trim(ps.name)) = lower(trim('Agendado'))
  AND ps.status = 'active';

UPDATE attendance_rules ar
SET pipeline_stage_id = ps.id,
    updated_at = NOW()
FROM pipeline_stages ps
WHERE ar.pipeline_stage_id IS NULL
  AND ar.answered = true
  AND ar.operational_action = 'sem_interesse'
  AND lower(trim(ps.name)) = lower(trim('Perdido'))
  AND ps.status = 'active';

-- Herança da matriz antiga (se existir) para slugs ainda sem etapa.
UPDATE attendance_rules ar
SET pipeline_stage_id = sub.pipeline_stage_id,
    updated_at = NOW()
FROM (
  SELECT cr.slug,
    (
      SELECT a.pipeline_stage_id
      FROM result_registration_associations a
      JOIN call_technical_result_types t ON t.id = a.call_technical_result_type_id
      WHERE a.commercial_result_type_id = cr.id
        AND a.status = 'active'
        AND t.answered = true
      ORDER BY a.id
      LIMIT 1
    ) AS pipeline_stage_id
  FROM approach_result_types cr
  WHERE cr.layer = 'commercial'
    AND cr.status = 'active'
) sub
WHERE ar.pipeline_stage_id IS NULL
  AND ar.answered = true
  AND ar.slug = sub.slug
  AND sub.pipeline_stage_id IS NOT NULL;
