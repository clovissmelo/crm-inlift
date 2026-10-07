import { get, nowIso, run } from "@/lib/db";
import { isWarmScreenCallRow } from "@/lib/warm-screen/call-outcome";

type CallSlice = {
  id: number;
  status: string;
  api4com_call_id: string | null;
  approach_id: number | null;
  metadata_json: string | null;
};

/** Falha antes de a telefonia aceitar a discagem (token, ramal, API indisponível). */
export function isWarmScreenConnectionFailure(call: Pick<CallSlice, "status" | "api4com_call_id" | "approach_id">): boolean {
  if (call.approach_id) return false;
  if (call.api4com_call_id) return false;
  return call.status === "failed" || call.status === "initiating";
}

function parseItemAndExecution(meta: string | null): { itemId: number | null; executionId: number | null } {
  if (!meta?.trim()) return { itemId: null, executionId: null };
  try {
    const j = JSON.parse(meta) as Record<string, unknown>;
    const itemRaw = j.warm_screen_item_id;
    const execRaw = j.warm_screen_execution_id;
    const itemId = itemRaw != null ? Number(itemRaw) : NaN;
    const executionId = execRaw != null ? Number(execRaw) : NaN;
    return {
      itemId: Number.isFinite(itemId) ? itemId : null,
      executionId: Number.isFinite(executionId) ? executionId : null
    };
  } catch {
    return { itemId: null, executionId: null };
  }
}

/** Remove registro órfão, devolve lead à fila da execução e pausa o motor. */
export async function dismissWarmScreenConnectionFailureCall(callId: number): Promise<boolean> {
  const call = await get<CallSlice>(
    `
      SELECT id, status, api4com_call_id, approach_id, metadata_json
      FROM api4com_calls WHERE id = @id
    `,
    { id: callId }
  );
  if (!call || !isWarmScreenCallRow(call) || !isWarmScreenConnectionFailure(call)) {
    return false;
  }

  const { itemId, executionId } = parseItemAndExecution(call.metadata_json);
  const now = nowIso();

  if (itemId && executionId) {
    const prev = await get<{ status: string }>(
      "SELECT status FROM warm_screen_execution_items WHERE id = @id AND execution_id = @execId",
      { id: itemId, execId: executionId }
    );
    if (prev && (prev.status === "failed" || prev.status === "dialing")) {
      await run(
        `
          UPDATE warm_screen_executions SET
            items_done = GREATEST(0, items_done - 1),
            items_error = CASE WHEN @wasFailed = 1 THEN GREATEST(0, items_error - 1) ELSE items_error END,
            updated_at = @now
          WHERE id = @execId
        `,
        { execId: executionId, wasFailed: prev.status === "failed" ? 1 : 0, now }
      );
    }

    await run(
      `
        UPDATE warm_screen_execution_items SET
          status = 'pending',
          phone_dialed = NULL,
          contact_id = NULL,
          api4com_call_row_id = NULL,
          skip_reason = NULL,
          error_message = NULL,
          completed_at = NULL,
          updated_at = @now
        WHERE id = @id AND execution_id = @execId
      `,
      { id: itemId, execId: executionId, now }
    );

    await run(
      `
        UPDATE warm_screen_executions SET
          status = 'paused',
          paused_at = COALESCE(paused_at, @now),
          current_item_id = NULL,
          updated_at = @now
        WHERE id = @id AND status = 'running'
      `,
      { id: executionId, now }
    );
  }

  await run("DELETE FROM api4com_calls WHERE id = @id AND approach_id IS NULL", { id: callId });
  return true;
}

export async function handleWarmScreenDialSetupFailure(input: {
  executionId: number;
  itemId: number;
  message: string;
  callRowId?: number | null;
}) {
  const now = nowIso();
  if (input.callRowId) {
    await dismissWarmScreenConnectionFailureCall(input.callRowId);
  } else {
    const orphan = await get<{ id: number }>(
      `
        SELECT id FROM api4com_calls
        WHERE metadata_json::jsonb ->> 'warm_screen_item_id' = @itemId
          AND metadata_json::jsonb ->> 'purpose' = 'warm_screen'
          AND approach_id IS NULL
        ORDER BY id DESC LIMIT 1
      `,
      { itemId: String(input.itemId) }
    );
    if (orphan) await dismissWarmScreenConnectionFailureCall(orphan.id);
  }

  await run(
    `
      UPDATE warm_screen_execution_items SET
        status = 'pending',
        phone_dialed = NULL,
        contact_id = NULL,
        api4com_call_row_id = NULL,
        error_message = NULL,
        completed_at = NULL,
        updated_at = @now
      WHERE id = @id AND execution_id = @execId AND status IN ('dialing', 'failed')
    `,
    { id: input.itemId, execId: input.executionId, now }
  );

  await run(
    `
      UPDATE warm_screen_executions SET
        status = 'paused',
        paused_at = COALESCE(paused_at, @now),
        last_error = @msg,
        current_item_id = NULL,
        updated_at = @now
      WHERE id = @id
    `,
    { id: input.executionId, msg: input.message, now }
  );
}
