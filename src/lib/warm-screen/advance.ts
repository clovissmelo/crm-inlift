import { initiateApi4comCall, listActiveCallsForUser } from "@/lib/api4com/calls";
import { buildClientDialStrategySummary } from "@/lib/call-strategy/eligible-phones";
import { get, nowIso, run } from "@/lib/db";
import { WARM_SCREEN_INTERVAL_MS } from "@/lib/warm-screen/constants";
import {
  completeWarmScreenItem,
  getExecutionById,
  type WarmScreenExecutionRow
} from "@/lib/warm-screen/executions";
import { expireWarmScreenStaleCalls } from "@/lib/warm-screen/stale-calls";
import { finalizeWarmScreenCall } from "@/lib/warm-screen/call-outcome";

async function getNextPendingItem(executionId: number) {
  return get<{
    id: number;
    client_id: number;
    product_ids: unknown;
  }>(
    `
      SELECT id, client_id, product_ids FROM warm_screen_execution_items
      WHERE execution_id = @execId AND status = 'pending'
      ORDER BY sort_order ASC LIMIT 1
    `,
    { execId: executionId }
  );
}

async function getDialingItem(executionId: number) {
  return get<{ id: number; api4com_call_row_id: number | null }>(
    `
      SELECT id, api4com_call_row_id FROM warm_screen_execution_items
      WHERE execution_id = @execId AND status = 'dialing'
      ORDER BY id DESC LIMIT 1
    `,
    { execId: executionId }
  );
}

async function settleDialingItemIfCallEnded(executionId: number) {
  const dialing = await getDialingItem(executionId);
  if (!dialing?.api4com_call_row_id) return false;

  const call = await get<{ id: number; status: string; ended_at: string | null; approach_id: number | null }>(
    "SELECT id, status, ended_at, approach_id FROM api4com_calls WHERE id = @id",
    { id: dialing.api4com_call_row_id }
  );
  if (!call) return false;
  if (call.status !== "completed" && call.status !== "failed") return false;

  if (call.status === "failed" && !call.approach_id) {
    await completeWarmScreenItem({
      itemId: dialing.id,
      executionId,
      status: "failed",
      callRowId: call.id,
      errorMessage: "Ligação encerrada (falha ou timeout)."
    });
    return true;
  }

  if (!call.approach_id) {
    await finalizeWarmScreenCall(call.id);
  } else {
    await completeWarmScreenItem({
      itemId: dialing.id,
      executionId,
      status: "completed_error",
      callRowId: call.id
    });
  }
  return true;
}

export async function advanceWarmScreenExecution(executionId: number): Promise<{
  advanced: boolean;
  message?: string;
  execution?: WarmScreenExecutionRow | null;
}> {
  const exec = await getExecutionById(executionId);
  if (!exec) return { advanced: false, message: "Execução não encontrada." };
  if (exec.status !== "running") return { advanced: false, message: "Execução não está rodando.", execution: exec };

  await expireWarmScreenStaleCalls({ userId: exec.dial_user_id });
  await settleDialingItemIfCallEnded(executionId);

  const stillDialing = await getDialingItem(executionId);
  if (stillDialing) {
    return { advanced: false, message: "Aguardando encerramento da ligação.", execution: exec };
  }

  const active = await listActiveCallsForUser(exec.dial_user_id);
  if (active.length > 0) {
    return { advanced: false, message: "Ramal ocupado.", execution: exec };
  }

  if (exec.last_call_ended_at) {
    const elapsed = Date.now() - new Date(exec.last_call_ended_at).getTime();
    if (elapsed < WARM_SCREEN_INTERVAL_MS) {
      return { advanced: false, message: "Intervalo entre ligações.", execution: exec };
    }
  }

  const item = await getNextPendingItem(executionId);
  if (!item) {
    await run(
      `
        UPDATE warm_screen_executions SET status = 'completed', finished_at = @now, updated_at = @now
        WHERE id = @id AND status = 'running'
      `,
      { id: executionId, now: nowIso() }
    );
    return { advanced: false, message: "Execução concluída.", execution: await getExecutionById(executionId) };
  }

  const strategy = await buildClientDialStrategySummary({ clientId: item.client_id });
  const phone = strategy.suggested;
  if (!phone) {
    await completeWarmScreenItem({
      itemId: item.id,
      executionId,
      status: "skipped",
      skipReason: strategy.lead_status === "sem_telefone" ? "sem_telefone" : "sem_numero_elegivel"
    });
    return advanceWarmScreenExecution(executionId);
  }

  const now = nowIso();
  await run(
    `
      UPDATE warm_screen_execution_items SET status = 'dialing', phone_dialed = @phone,
        contact_id = @contactId, updated_at = @now
      WHERE id = @id
    `,
    {
      id: item.id,
      phone: phone.phone,
      contactId: phone.primary_contact_id,
      now
    }
  );
  await run(
    `
      UPDATE warm_screen_executions SET current_item_id = @itemId, updated_at = @now WHERE id = @id
    `,
    { id: executionId, itemId: item.id, now }
  );

  try {
    const result = await initiateApi4comCall({
      userId: exec.runner_user_id,
      dialIdentityUserId: exec.dial_user_id,
      clientId: item.client_id,
      contactId: phone.primary_contact_id,
      productId: null,
      phone: phone.phone,
      warmScreen: {
        executionId,
        itemId: item.id
      }
    });
    await run(
      `
        UPDATE warm_screen_execution_items SET api4com_call_row_id = @callId, updated_at = @now
        WHERE id = @id
      `,
      { id: item.id, callId: result.call_record_id, now: nowIso() }
    );
    return { advanced: true, execution: await getExecutionById(executionId) };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao discar";
    await completeWarmScreenItem({
      itemId: item.id,
      executionId,
      status: "failed",
      errorMessage: message
    });
    await run(
      `
        UPDATE warm_screen_executions SET last_error = @msg, last_call_ended_at = @now, updated_at = @now
        WHERE id = @id
      `,
      { id: executionId, msg: message, now: nowIso() }
    );
    return { advanced: false, message, execution: await getExecutionById(executionId) };
  }
}
