-- Controle explícito de presença na fila de prospecção (ex.: saiu por resultado frio)

ALTER TABLE clients ADD COLUMN IF NOT EXISTS in_prospeccao_queue BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'approach_result_types' AND column_name = 'lead_qualification'
  ) THEN
    UPDATE clients SET in_prospeccao_queue = false
    WHERE id IN (
      SELECT a.client_id
      FROM approaches a
      JOIN approach_result_types rt ON rt.id = a.result_type_id
      WHERE rt.lead_qualification = 'cold'
        AND a.id = (
          SELECT a2.id FROM approaches a2
          WHERE a2.client_id = a.client_id
          ORDER BY a2.occurred_at DESC, a2.id DESC
          LIMIT 1
        )
    );
  END IF;
END $$;
