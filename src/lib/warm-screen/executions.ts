import type { ClientFilters } from "@/lib/clients-query";
import { all, get, nowIso, run } from "@/lib/db";
import { queryWarmScreenLeadQueue } from "@/lib/warm-screen/queue";
import { listActiveProductIdsInQueue } from "@/lib/client-product-prospeccao";

export type WarmScreenExecutionStatus = "running" | "paused" | "stopped" | "completed" | "failed";

export type WarmScreenExecutionRow = {
  id: number;
  runner_user_id: number;
  dial_user_id: number;
  filters_json: unknown;
  status: WarmScreenExecutionStatus;
  paused_at: string | null;
  stopped_at: string | null;
  started_at: string;
  finished_at: string | null;
  last_call_ended_at: string | null;
  items_total: number;
  items_done: number;
  items_warmed: number;
  items_skipped: number;
  items_error: number;
  current_item_id: number | null;
  last_error: string | null;
};

export type WarmScreenItemRow = {
  id: number;
  execution_id: number;
  client_id: number;
  sort_order: number;
  status: string;
  skip_reason: string | null;
  phone_dialed: string | null;
  contact_id: number | null;
  product_ids: number[];
  api4com_call_row_id: number | null;
  error_message: string | null;
  completed_at: string | null;
};

export async function getRunningExecutionForRunner(runnerUserId: number) {
  return get<WarmScreenExecutionRow>(
    `
      SELECT * FROM warm_screen_executions
      WHERE runner_user_id = @userId AND status IN ('running', 'paused')
      ORDER BY id DESC LIMIT 1
    `,
    { userId: runnerUserId }
  );
}

export async function startWarmScreenExecution(input: {
  runnerUserId: number;
  dialUserId: number;
  filters: ClientFilters;
}) {
  const existing = await getRunningExecutionForRunner(input.runnerUserId);
  if (existing) {
    throw new Error("Já existe uma execução em andamento. Pause ou encerre antes de iniciar outra.");
  }

  const snapshot = await queryWarmScreenLeadQueue({
    ...input.filters,
    limit: 5000,
    offset: 0
  });

  const now = nowIso();
  const insert = await run(
    `
      INSERT INTO warm_screen_executions (
        runner_user_id, dial_user_id, filters_json, status, started_at, items_total, created_at, updated_at
      ) VALUES (
        @runner, @dial, @filters::jsonb, 'running', @now, @total, @now, @now
      )
    `,
    {
      runner: input.runnerUserId,
      dial: input.dialUserId,
      filters: JSON.stringify(input.filters),
      now,
      total: snapshot.items.length
    }
  );

  const executionId = Number(insert.lastInsertRowid);
  let order = 0;
  for (const item of snapshot.items) {
    const productIds = item.product_ids?.length
      ? item.product_ids
      : await listActiveProductIdsInQueue(item.id);
    await run(
      `
        INSERT INTO warm_screen_execution_items (
          execution_id, client_id, sort_order, product_ids, created_at, updated_at
        ) VALUES (@execId, @clientId, @ord, @products::jsonb, @now, @now)
      `,
      {
        execId: executionId,
        clientId: item.id,
        ord: order++,
        products: JSON.stringify(productIds),
        now
      }
    );
  }

  return getExecutionById(executionId);
}

export async function getExecutionById(id: number) {
  return get<WarmScreenExecutionRow>("SELECT * FROM warm_screen_executions WHERE id = @id", { id });
}

export async function listExecutionItems(executionId: number) {
  const rows = await all<WarmScreenItemRow & { product_ids: unknown }>(
    "SELECT * FROM warm_screen_execution_items WHERE execution_id = @id ORDER BY sort_order",
    { id: executionId }
  );
  return rows.map((r) => ({
    ...r,
    product_ids: Array.isArray(r.product_ids)
      ? (r.product_ids as number[])
      : typeof r.product_ids === "string"
        ? (JSON.parse(r.product_ids) as number[])
        : []
  }));
}

export async function pauseExecution(executionId: number, runnerUserId: number) {
  const exec = await getExecutionById(executionId);
  if (!exec || exec.runner_user_id !== runnerUserId) throw new Error("Execução não encontrada.");
  if (exec.status !== "running") throw new Error("Só é possível pausar execuções em andamento.");
  const now = nowIso();
  await run(
    `
      UPDATE warm_screen_executions SET status = 'paused', paused_at = @now, updated_at = @now
      WHERE id = @id
    `,
    { id: executionId, now }
  );
}

export async function resumeExecution(executionId: number, runnerUserId: number) {
  const exec = await getExecutionById(executionId);
  if (!exec || exec.runner_user_id !== runnerUserId) throw new Error("Execução não encontrada.");
  if (exec.status !== "paused") throw new Error("Execução não está pausada.");
  const now = nowIso();
  await run(
    `
      UPDATE warm_screen_executions SET status = 'running', paused_at = NULL, updated_at = @now
      WHERE id = @id
    `,
    { id: executionId, now }
  );
}

export async function stopExecution(executionId: number, runnerUserId: number) {
  const exec = await getExecutionById(executionId);
  if (!exec || exec.runner_user_id !== runnerUserId) throw new Error("Execução não encontrada.");
  if (exec.status === "stopped" || exec.status === "completed") return;
  const now = nowIso();
  await run(
    `
      UPDATE warm_screen_executions SET
        status = 'stopped', stopped_at = @now, finished_at = @now, updated_at = @now
      WHERE id = @id
    `,
    { id: executionId, now }
  );
}

export async function completeWarmScreenItem(input: {
  itemId: number;
  executionId: number;
  status: "completed_error" | "completed_warmed" | "skipped" | "failed";
  callRowId?: number | null;
  skipReason?: string | null;
  errorMessage?: string | null;
}) {
  const now = nowIso();
  await run(
    `
      UPDATE warm_screen_execution_items SET
        status = @status,
        api4com_call_row_id = COALESCE(@callId, api4com_call_row_id),
        skip_reason = COALESCE(@skip, skip_reason),
        error_message = COALESCE(@err, error_message),
        completed_at = @now,
        updated_at = @now
      WHERE id = @id AND execution_id = @execId
    `,
    {
      id: input.itemId,
      execId: input.executionId,
      status: input.status,
      callId: input.callRowId ?? null,
      skip: input.skipReason ?? null,
      err: input.errorMessage ?? null,
      now
    }
  );

  const warmed = input.status === "completed_warmed" ? 1 : 0;
  const skipped = input.status === "skipped" ? 1 : 0;
  const err = input.status === "completed_error" || input.status === "failed" ? 1 : 0;

  await run(
    `
      UPDATE warm_screen_executions SET
        items_done = items_done + 1,
        items_warmed = items_warmed + @warmed,
        items_skipped = items_skipped + @skipped,
        items_error = items_error + @err,
        last_call_ended_at = @now,
        current_item_id = NULL,
        updated_at = @now
      WHERE id = @execId
    `,
    { execId: input.executionId, warmed, skipped, err, now }
  );

  await maybeFinishExecution(input.executionId);
}

async function maybeFinishExecution(executionId: number) {
  const pending = await get<{ n: number }>(
    `
      SELECT COUNT(*)::int AS n FROM warm_screen_execution_items
      WHERE execution_id = @id AND status IN ('pending', 'dialing')
    `,
    { id: executionId }
  );
  if ((pending?.n ?? 0) > 0) return;
  await run(
    `
      UPDATE warm_screen_executions SET status = 'completed', finished_at = @now, updated_at = @now
      WHERE id = @id AND status IN ('running', 'paused')
    `,
    { id: executionId, now: nowIso() }
  );
}

export async function listExecutionsForViewer(input: {
  viewerUserId: number;
  isManagerOrAdmin: boolean;
  limit?: number;
  offset?: number;
}) {
  const limit = input.limit ?? 30;
  const offset = input.offset ?? 0;
  if (input.isManagerOrAdmin) {
    return all<WarmScreenExecutionRow>(
      `
        SELECT * FROM warm_screen_executions
        ORDER BY id DESC LIMIT @limit OFFSET @offset
      `,
      { limit, offset }
    );
  }
  return all<WarmScreenExecutionRow>(
    `
      SELECT * FROM warm_screen_executions
      WHERE runner_user_id = @uid OR dial_user_id = @uid
      ORDER BY id DESC LIMIT @limit OFFSET @offset
    `,
    { uid: input.viewerUserId, limit, offset }
  );
}
