import { all, get, nowIso, run } from "@/lib/db";
import {
  WARM_SCREEN_ASSISTED_STALE_CALL_MS,
  WARM_SCREEN_PURPOSE,
  WARM_SCREEN_STALE_CALL_MS,
  WARM_SCREEN_STALE_MESSAGE
} from "@/lib/warm-screen/constants";
import { getWarmScreenDialModeForCall } from "@/lib/warm-screen/dial-mode";
import { completeWarmScreenItem } from "@/lib/warm-screen/executions";
import {
  dismissWarmScreenConnectionFailureCall,
  isWarmScreenConnectionFailure
} from "@/lib/warm-screen/connection-failure";

async function finalizeExpiredWarmCall(callId: number) {
  const call = await get<{ id: number; status: string; api4com_call_id: string | null; approach_id: number | null }>(
    "SELECT id, status, api4com_call_id, approach_id FROM api4com_calls WHERE id = @id",
    { id: callId }
  );
  if (call && isWarmScreenConnectionFailure(call)) {
    await dismissWarmScreenConnectionFailureCall(callId);
    return;
  }
  const { persistCallTechnicalResult } = await import("@/lib/api4com/persist-technical-result");
  await persistCallTechnicalResult(callId);
  const { finalizeWarmScreenCall } = await import("@/lib/warm-screen/call-outcome");
  await finalizeWarmScreenCall(callId);
}

/** Encerra ligações do motor presas (timeout a partir do início, não do último webhook). */
export async function expireWarmScreenStaleCalls(scope?: {
  runnerUserId?: number;
  executionId?: number;
}) {
  const cutoff = new Date(Date.now() - WARM_SCREEN_STALE_CALL_MS).toISOString();
  const params: Record<string, string | number> = {
    cutoff,
    now: nowIso(),
    msg: WARM_SCREEN_STALE_MESSAGE,
    purpose: WARM_SCREEN_PURPOSE
  };
  let userClause = "";
  if (scope?.runnerUserId != null) {
    userClause = " AND user_id = @runnerUserId";
    params.runnerUserId = scope.runnerUserId;
  }
  let execClause = "";
  if (scope?.executionId != null) {
    execClause = " AND metadata_json::jsonb ->> 'warm_screen_execution_id' = @executionIdStr";
    params.executionIdStr = String(scope.executionId);
  }

  const rows = await all<{ id: number }>(
    `
      SELECT id FROM api4com_calls
      WHERE status IN ('initiating', 'ringing', 'in_progress')
        AND COALESCE(started_at, created_at) < @cutoff
        AND metadata_json::jsonb ->> 'purpose' = @purpose
        ${userClause}
        ${execClause}
    `,
    params
  );

  for (const row of rows) {
    const callRow = await get<{ status: string; answered_at: string | null }>(
      "SELECT status, answered_at FROM api4com_calls WHERE id = @id",
      { id: row.id }
    );
    if (callRow?.status === "in_progress" && callRow.answered_at) {
      const mode = await getWarmScreenDialModeForCall(row.id);
      if (mode === "assisted") {
        const assistedCutoff = new Date(Date.now() - WARM_SCREEN_ASSISTED_STALE_CALL_MS).toISOString();
        const started = await get<{ started_at: string | null; created_at: string }>(
          "SELECT started_at, created_at FROM api4com_calls WHERE id = @id",
          { id: row.id }
        );
        const since = started?.started_at ?? started?.created_at;
        if (since && since >= assistedCutoff) continue;
      }
    }

    await run(
      `
        UPDATE api4com_calls SET
          status = 'failed',
          error_message = @msg,
          ended_at = COALESCE(ended_at, @now),
          result_pending = false,
          updated_at = @now
        WHERE id = @id
      `,
      { id: row.id, now: params.now, msg: WARM_SCREEN_STALE_MESSAGE }
    );
    try {
      await finalizeExpiredWarmCall(row.id);
    } catch {
      /* item será fechado no settle da execução */
    }
  }

  return rows.length;
}

/** Item em dialing sem ligação concluída além do timeout da execução. */
export async function recoverStuckWarmScreenItems(executionId: number) {
  const cutoff = new Date(Date.now() - WARM_SCREEN_STALE_CALL_MS - 5_000).toISOString();
  const rows = await all<{
    id: number;
    api4com_call_row_id: number | null;
    metadata_json: string | null;
  }>(
    `
      SELECT i.id, i.api4com_call_row_id, c.metadata_json
      FROM warm_screen_execution_items i
      LEFT JOIN api4com_calls c ON c.id = i.api4com_call_row_id
      WHERE i.execution_id = @executionId
        AND i.status = 'dialing'
        AND i.updated_at < @cutoff
    `,
    { executionId, cutoff }
  );

  for (const row of rows) {
    if (row.api4com_call_row_id) {
      const call = await all<{ id: number; status: string }>(
        "SELECT id, status FROM api4com_calls WHERE id = @id",
        { id: row.api4com_call_row_id }
      );
      const st = call[0]?.status;
      if (st && st !== "completed" && st !== "failed") {
        await run(
          `
            UPDATE api4com_calls SET
              status = 'failed',
              error_message = @msg,
              ended_at = COALESCE(ended_at, @now),
              result_pending = false,
              updated_at = @now
            WHERE id = @id
          `,
          { id: row.api4com_call_row_id, now: nowIso(), msg: WARM_SCREEN_STALE_MESSAGE }
        );
        try {
          await finalizeExpiredWarmCall(row.api4com_call_row_id);
        } catch {
          await completeWarmScreenItem({
            itemId: row.id,
            executionId,
            status: "failed",
            callRowId: row.api4com_call_row_id,
            errorMessage: WARM_SCREEN_STALE_MESSAGE
          });
        }
        continue;
      }
    }
    await completeWarmScreenItem({
      itemId: row.id,
      executionId,
      status: "failed",
      errorMessage: "Tempo esgotado aguardando telefonia."
    });
  }

  return rows.length;
}
