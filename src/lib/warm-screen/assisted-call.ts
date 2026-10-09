import { get } from "@/lib/db";

export type WarmScreenAssistedCallRow = {
  id: number;
  client_id: number | null;
  product_id: number | null;
  client_name: string | null;
  product_name: string | null;
  contact_name: string | null;
  status: string;
  script_flow_log: unknown;
};

/** Ligação ativa ou complemento pendente do aquecedor em modo assistido. */
export async function getWarmScreenAssistedCallContext(userId: number): Promise<{
  activeCall: WarmScreenAssistedCallRow | null;
  resultCallId: number | null;
}> {
  const activeCall = await get<WarmScreenAssistedCallRow>(
    `
      SELECT c.id, c.client_id, c.product_id,
        COALESCE(cl.trade_name, cl.legal_name) AS client_name,
        p.name AS product_name,
        ct.name AS contact_name,
        c.status,
        c.script_flow_log
      FROM api4com_calls c
      INNER JOIN warm_screen_execution_items i ON i.api4com_call_row_id = c.id
      INNER JOIN warm_screen_executions e ON e.id = i.execution_id
      LEFT JOIN clients cl ON cl.id = c.client_id
      LEFT JOIN contacts ct ON ct.id = c.contact_id
      LEFT JOIN products p ON p.id = c.product_id
      WHERE e.dial_mode = 'assisted'
        AND (e.dial_user_id = @userId OR e.runner_user_id = @userId)
        AND c.status = 'in_progress'
        AND c.ended_at IS NULL
      ORDER BY c.id DESC
      LIMIT 1
    `,
    { userId }
  );

  const pending = await get<{ id: number }>(
    `
      SELECT c.id
      FROM api4com_calls c
      INNER JOIN warm_screen_execution_items i ON i.api4com_call_row_id = c.id
      INNER JOIN warm_screen_executions e ON e.id = i.execution_id
      WHERE e.dial_mode = 'assisted'
        AND (e.dial_user_id = @userId OR e.runner_user_id = @userId)
        AND c.status = 'completed'
        AND c.result_pending = true
        AND c.approach_id IS NULL
      ORDER BY c.ended_at DESC NULLS LAST, c.id DESC
      LIMIT 1
    `,
    { userId }
  );

  return {
    activeCall: activeCall ?? null,
    resultCallId: pending?.id ?? null
  };
}

/** Após complemento assistido, retoma execução pausada se não houver mais pendências. */
export async function resumeWarmScreenAfterAssistedRegistration(callId: number) {
  const row = await get<{ execution_id: number }>(
    `
      SELECT i.execution_id
      FROM warm_screen_execution_items i
      INNER JOIN warm_screen_executions e ON e.id = i.execution_id
      WHERE i.api4com_call_row_id = @callId AND e.dial_mode = 'assisted'
      LIMIT 1
    `,
    { callId }
  );
  if (!row) return;

  const stillPending = await get<{ ok: number }>(
    `
      SELECT 1 AS ok
      FROM api4com_calls c
      INNER JOIN warm_screen_execution_items i ON i.api4com_call_row_id = c.id
      WHERE i.execution_id = @execId
        AND c.result_pending = true
        AND c.approach_id IS NULL
        AND c.status = 'completed'
      LIMIT 1
    `,
    { execId: row.execution_id }
  );
  if (stillPending) return;

  const inProgress = await get<{ ok: number }>(
    `
      SELECT 1 AS ok FROM api4com_calls c
      INNER JOIN warm_screen_execution_items i ON i.api4com_call_row_id = c.id
      WHERE i.execution_id = @execId AND c.status = 'in_progress' AND c.ended_at IS NULL
      LIMIT 1
    `,
    { execId: row.execution_id }
  );
  if (inProgress) return;

  const { nowIso, run } = await import("@/lib/db");
  await run(
    `
      UPDATE warm_screen_executions SET
        status = 'running',
        paused_at = NULL,
        last_error = NULL,
        updated_at = @now
      WHERE id = @id AND status = 'paused' AND dial_mode = 'assisted'
    `,
    { id: row.execution_id, now: nowIso() }
  );
}
