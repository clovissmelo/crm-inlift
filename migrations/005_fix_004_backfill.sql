-- Repara backfill da 004 se ela falhou no meio (seguro reexecutar)

-- Coluna da 002 (produção pode ter schema_migrations sem o ALTER ter rodado)
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS engagement_status TEXT NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF to_regclass('public.meetings') IS NOT NULL THEN
    UPDATE opportunities SET
      title = COALESCE(opportunities.title, p.name || ' — negociação'),
      origin_bdr_user_id = COALESCE(opportunities.origin_bdr_user_id, c.bdr_user_id),
      owner_user_id = COALESCE(opportunities.owner_user_id, c.bdr_user_id),
      pipeline_stage_id = COALESCE(
        opportunities.pipeline_stage_id,
        CASE
          WHEN COALESCE(opportunities.engagement_status, 'active') = 'closed'
            OR lower(trim(COALESCE(opportunities.stage, 'open'))) IN ('closed', 'lost')
            THEN (SELECT id FROM pipeline_stages WHERE kind = 'lost' ORDER BY sort_order LIMIT 1)
          WHEN EXISTS (
            SELECT 1 FROM meetings m
            WHERE m.client_id = opportunities.client_id AND m.product_id = opportunities.product_id
              AND m.status NOT IN ('cancelled') AND m.starts_at >= now() - interval '90 days'
          ) THEN (SELECT id FROM pipeline_stages WHERE name = 'Agendado' LIMIT 1)
          ELSE (SELECT id FROM pipeline_stages WHERE name = 'Interessado' LIMIT 1)
        END
      ),
      outcome = CASE
        WHEN COALESCE(opportunities.engagement_status, 'active') = 'closed'
          OR lower(trim(COALESCE(opportunities.stage, 'open'))) IN ('closed', 'lost')
          THEN 'lost'
        ELSE COALESCE(opportunities.outcome, 'open')
      END
    FROM products p, clients c
    WHERE opportunities.client_id = c.id AND opportunities.product_id = p.id;

    UPDATE meetings m SET opportunity_id = sub.opp_id
    FROM (
      SELECT m2.id AS meeting_id, (
        SELECT o.id FROM opportunities o
        WHERE o.client_id = m2.client_id AND o.product_id = m2.product_id AND o.outcome = 'open'
        ORDER BY o.updated_at DESC
        LIMIT 1
      ) AS opp_id
      FROM meetings m2
      WHERE m2.opportunity_id IS NULL AND m2.product_id IS NOT NULL
    ) sub
    WHERE m.id = sub.meeting_id AND sub.opp_id IS NOT NULL;
  ELSE
    UPDATE opportunities SET
      title = COALESCE(opportunities.title, p.name || ' — negociação'),
      origin_bdr_user_id = COALESCE(opportunities.origin_bdr_user_id, c.bdr_user_id),
      owner_user_id = COALESCE(opportunities.owner_user_id, c.bdr_user_id),
      pipeline_stage_id = COALESCE(
        opportunities.pipeline_stage_id,
        CASE
          WHEN COALESCE(opportunities.engagement_status, 'active') = 'closed'
            OR lower(trim(COALESCE(opportunities.stage, 'open'))) IN ('closed', 'lost')
            THEN (SELECT id FROM pipeline_stages WHERE kind = 'lost' ORDER BY sort_order LIMIT 1)
          ELSE (SELECT id FROM pipeline_stages WHERE name = 'Interessado' LIMIT 1)
        END
      ),
      outcome = CASE
        WHEN COALESCE(opportunities.engagement_status, 'active') = 'closed'
          OR lower(trim(COALESCE(opportunities.stage, 'open'))) IN ('closed', 'lost')
          THEN 'lost'
        ELSE COALESCE(opportunities.outcome, 'open')
      END
    FROM products p, clients c
    WHERE opportunities.client_id = c.id AND opportunities.product_id = p.id;
  END IF;
END $$;

UPDATE opportunities SET title = 'Negociação' WHERE title IS NULL OR trim(title) = '';

UPDATE opportunities SET
  outcome = CASE ps.kind WHEN 'won' THEN 'won' WHEN 'lost' THEN 'lost' ELSE opportunities.outcome END
FROM pipeline_stages ps
WHERE opportunities.pipeline_stage_id = ps.id;

CREATE INDEX IF NOT EXISTS idx_opportunities_kanban ON opportunities (pipeline_stage_id, outcome, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_client ON opportunities (client_id, outcome);
