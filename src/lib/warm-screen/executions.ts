import type { ClientFilters } from "@/lib/clients-query";
import { all, get, nowIso, run } from "@/lib/db";
import { queryWarmScreenLeadQueue } from "@/lib/warm-screen/queue";
import { listActiveProductIdsInQueue } from "@/lib/client-product-prospeccao";
import { buildWarmScreenPrompt, type WarmScreenPromptPayload } from "@/lib/warm-screen/prompt-lines";
import { parseWarmScreenDialMode, type WarmScreenDialMode } from "@/lib/warm-screen/dial-mode";

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
  items_not_warmed: number;
  items_error: number;
  current_item_id: number | null;
  last_error: string | null;
  dial_mode: WarmScreenDialMode;
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

export async function pauseExecutionForAssistedHandoff(executionId: number) {
  const now = nowIso();
  await run(
    `
      UPDATE warm_screen_executions SET
        status = 'paused',
        paused_at = COALESCE(paused_at, @now),
        last_error = @msg,
        updated_at = @now
      WHERE id = @id AND status IN ('running', 'paused')
    `,
    {
      id: executionId,
      now,
      msg: "Modo assistido: ligação atendida — conduza no painel lateral (roteiro e telefone). Retome o motor quando encerrar."
    }
  );
}

export async function startWarmScreenExecution(input: {
  runnerUserId: number;
  dialUserId: number;
  filters: ClientFilters;
  dialMode?: WarmScreenDialMode;
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
        runner_user_id, dial_user_id, filters_json, status, dial_mode, started_at, items_total, created_at, updated_at
      ) VALUES (
        @runner, @dial, @filters::jsonb, 'running', @dialMode, @now, @total, @now, @now
      )
    `,
    {
      runner: input.runnerUserId,
      dial: input.dialUserId,
      filters: JSON.stringify(input.filters),
      dialMode: input.dialMode ?? "silent",
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

function parseItemProductIds(r: { product_ids: unknown }) {
  return Array.isArray(r.product_ids)
    ? (r.product_ids as number[])
    : typeof r.product_ids === "string"
      ? (JSON.parse(r.product_ids) as number[])
      : [];
}

export type WarmScreenExecutionItemView = {
  id: number;
  client_id: number;
  sort_order: number;
  status: string;
  phone_dialed: string | null;
  skip_reason: string | null;
  error_message: string | null;
  prompt: WarmScreenPromptPayload;
};

export async function listExecutionItemsForRealtime(
  executionId: number,
  execution: Pick<WarmScreenExecutionRow, "status" | "current_item_id" | "dial_mode">
): Promise<WarmScreenExecutionItemView[]> {
  const rows = await all<
    WarmScreenItemRow & {
      product_ids: unknown;
      call_status: string | null;
      call_error_message: string | null;
      call_result_pending: boolean | null;
    }
  >(
    `
      SELECT
        i.*,
        c.status AS call_status,
        c.error_message AS call_error_message,
        c.result_pending AS call_result_pending
      FROM warm_screen_execution_items i
      LEFT JOIN api4com_calls c ON c.id = i.api4com_call_row_id
      WHERE i.execution_id = @id
      ORDER BY i.sort_order
    `,
    { id: executionId }
  );

  const normalized = rows.map((r) => ({
    ...r,
    product_ids: parseItemProductIds(r)
  }));

  const activeDialing = normalized.find((i) => i.status === "dialing");
  const firstPending = normalized.find((i) => i.status === "pending");
  const queueBlocked = Boolean(activeDialing);

  return normalized.map((item) => ({
    id: item.id,
    client_id: item.client_id,
    sort_order: item.sort_order,
    status: item.status,
    phone_dialed: item.phone_dialed,
    skip_reason: item.skip_reason,
    error_message: item.error_message,
    prompt: buildWarmScreenPrompt(
      item,
      item.api4com_call_row_id
        ? {
            status: item.call_status,
            error_message: item.call_error_message,
            result_pending: item.call_result_pending
          }
        : null,
      {
        executionStatus: execution.status,
        queueBlocked: queueBlocked && item.status === "pending",
        isCurrent:
          execution.current_item_id === item.id ||
          (!activeDialing && firstPending?.id === item.id && item.status === "pending"),
        dialMode: parseWarmScreenDialMode(execution.dial_mode)
      }
    )
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
  const notWarmed = input.status === "completed_error" ? 1 : 0;
  const err = input.status === "failed" ? 1 : 0;

  await run(
    `
      UPDATE warm_screen_executions SET
        items_done = items_done + 1,
        items_warmed = items_warmed + @warmed,
        items_skipped = items_skipped + @skipped,
        items_not_warmed = items_not_warmed + @notWarmed,
        items_error = items_error + @err,
        last_call_ended_at = @now,
        current_item_id = NULL,
        updated_at = @now
      WHERE id = @execId
    `,
    { execId: input.executionId, warmed, skipped, notWarmed, err, now }
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

export async function deleteWarmScreenExecution(executionId: number) {
  const exec = await getExecutionById(executionId);
  if (!exec) throw new Error("Execução não encontrada.");
  if (exec.status === "running" || exec.status === "paused") {
    throw new Error("Encerre a execução antes de excluir do histórico.");
  }
  await run("DELETE FROM warm_screen_executions WHERE id = @id", { id: executionId });
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
