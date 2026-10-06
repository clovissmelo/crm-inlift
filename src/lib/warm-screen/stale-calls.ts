import { all, nowIso, run } from "@/lib/db";
import { WARM_SCREEN_STALE_CALL_MS, WARM_SCREEN_STALE_MESSAGE } from "@/lib/warm-screen/constants";

/** Encerra ligações do motor presas (timeout curto para liberar o ramal). */
export async function expireWarmScreenStaleCalls(scope?: { userId?: number; dialUserId?: number }) {
  const cutoff = new Date(Date.now() - WARM_SCREEN_STALE_CALL_MS).toISOString();
  const params: Record<string, string | number> = { cutoff, now: nowIso(), msg: WARM_SCREEN_STALE_MESSAGE };
  let userClause = "";
  if (scope?.userId != null) {
    userClause += " AND user_id = @userId";
    params.userId = scope.userId;
  }

  const rows = await all<{ id: number }>(
    `
      SELECT id FROM api4com_calls
      WHERE status IN ('initiating', 'ringing', 'in_progress')
        AND updated_at < @cutoff
        AND metadata_json::jsonb ->> 'purpose' = 'warm_screen'
        ${userClause}
    `,
    params
  );

  for (const row of rows) {
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
  }

  return rows.length;
}
