-- Somente leitura — executar no Supabase SQL Editor (produção) antes da migração 039.
-- Não altera dados.

-- 1) Matriz / associações ativas
SELECT a.id, t.slug AS technical, t.answered, cr.slug AS commercial, a.pipeline_stage_id,
  ps.name AS stage_name, a.dial_counts_for_exhaustion, a.dial_occurrence_kind, a.dial_occurrence_limit
FROM result_registration_associations a
JOIN call_technical_result_types t ON t.id = a.call_technical_result_type_id
JOIN approach_result_types cr ON cr.id = a.commercial_result_type_id
LEFT JOIN pipeline_stages ps ON ps.id = a.pipeline_stage_id
WHERE a.status = 'active'
ORDER BY t.answered, t.slug, cr.slug;

-- 2) Catálogo comercial ativo
SELECT id, slug, name, require_schedule_return, requires_meeting, mark_phone_verified,
  require_final_registration, lead_qualification
FROM approach_result_types
WHERE layer = 'commercial' AND status = 'active'
ORDER BY sort_order;

-- 3) Estratégia global
SELECT * FROM call_strategy_settings WHERE id = 1;

-- 4) Prioridades fila (ordem configurada)
SELECT id, slug, name, sort_order, rule_kind, status FROM prospeccao_priority_types ORDER BY sort_order;

-- 5) Etapas funil
SELECT id, name, sort_order, kind, status FROM pipeline_stages ORDER BY sort_order;

-- 6) Fila prospecção (legado cliente)
SELECT
  COUNT(*) FILTER (WHERE in_prospeccao_queue) AS in_queue,
  COUNT(*) FILTER (WHERE NOT in_prospeccao_queue) AS out_queue,
  COUNT(*) FILTER (WHERE prospeccao_exit_reason = 'phones_exhausted') AS exit_phones,
  COUNT(*) FILTER (WHERE prospeccao_exit_reason = 'commercial_close') AS exit_commercial
FROM clients;

-- 7) Pares cliente × produto (base para fila por produto)
SELECT COUNT(DISTINCT client_id) AS clients, COUNT(*) AS pairs FROM client_products;

-- 8) Conversões (cliente oficial candidatos)
SELECT COUNT(DISTINCT o.client_id) AS clients_with_won
FROM opportunities o WHERE o.outcome = 'won';

-- 9) Contadores telefone (amostra)
SELECT status, COUNT(*) FROM client_phone_dial_state GROUP BY status;

-- 10) Regras legadas não usadas no runtime
SELECT COUNT(*) AS active_legacy_rules FROM call_strategy_result_rules WHERE status = 'active';
