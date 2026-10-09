import { initiateApi4comCall, listActiveCallsForUser } from "@/lib/api4com/calls";
import { listClientPhonesWithState } from "@/lib/call-strategy/client-phones";
import { getNextRegisteredPhoneForWarmItem } from "@/lib/warm-screen/phone-round";
import { get, nowIso, run } from "@/lib/db";
import { WARM_SCREEN_INTERVAL_MS } from "@/lib/warm-screen/constants";
import {
  completeWarmScreenItem,
  getExecutionById,
  type WarmScreenExecutionRow
} from "@/lib/warm-screen/executions";
import { expireWarmScreenStaleCalls, recoverStuckWarmScreenItems } from "@/lib/warm-screen/stale-calls";
import { finalizeWarmScreenCall } from "@/lib/warm-screen/call-outcome";
import { finishWarmScreenItemAfterPhoneAttempt } from "@/lib/warm-screen/item-after-call";
import {
  dismissWarmScreenConnectionFailureCall,
  handleWarmScreenDialSetupFailure,
  isWarmScreenAutoRevertFailure
} from "@/lib/warm-screen/connection-failure";

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
  return get<{ id: number; client_id: number; api4com_call_row_id: number | null }>(
    `
      SELECT id, client_id, api4com_call_row_id FROM warm_screen_execution_items
      WHERE execution_id = @execId AND status = 'dialing'
      ORDER BY id DESC LIMIT 1
    `,
    { execId: executionId }
  );
}

async function settleDialingItemIfCallEnded(executionId: number) {
  const dialing = await getDialingItem(executionId);
  if (!dialing?.api4com_call_row_id) return false;

  const call = await get<{
    id: number;
    status: string;
    ended_at: string | null;
    approach_id: number | null;
    api4com_call_id: string | null;
    error_message: string | null;
    answered_at: string | null;
    duration_seconds: number | null;
    hangup_cause_code: string | null;
    technical_result_type_id: number | null;
  }>(
    `
      SELECT id, status, ended_at, approach_id, api4com_call_id, error_message, answered_at,
        duration_seconds, hangup_cause_code, technical_result_type_id
      FROM api4com_calls WHERE id = @id
    `,
    { id: dialing.api4com_call_row_id }
  );
  if (!call) return false;
  if (call.status !== "completed" && call.status !== "failed") return false;

  if (call.status === "failed" && isWarmScreenAutoRevertFailure(call)) {
    await dismissWarmScreenConnectionFailureCall(call.id);
    return true;
  }

  if (call.status === "failed" && !call.approach_id) {
    const { persistCallTechnicalResult } = await import("@/lib/api4com/persist-technical-result");
    await persistCallTechnicalResult(call.id);
    await finalizeWarmScreenCall(call.id);
    return true;
  }

  if (!call.approach_id) {
    await finalizeWarmScreenCall(call.id);
  } else {
    const warmed = await get<{ warm_screen_confirmed_at: string | null }>(
      "SELECT warm_screen_confirmed_at FROM clients WHERE id = @id",
      { id: dialing.client_id }
    );
    await finishWarmScreenItemAfterPhoneAttempt({
      itemId: dialing.id,
      executionId,
      clientId: dialing.client_id,
      answered: Boolean(warmed?.warm_screen_confirmed_at),
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

  await expireWarmScreenStaleCalls({ runnerUserId: exec.dial_user_id, executionId: exec.id });
  await recoverStuckWarmScreenItems(exec.id);
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

  const phone = await getNextRegisteredPhoneForWarmItem(item.client_id, executionId, item.id);
  if (!phone) {
    const registered = await listClientPhonesWithState(item.client_id);
    if (registered.length === 0) {
      await completeWarmScreenItem({
        itemId: item.id,
        executionId,
        status: "skipped",
        skipReason: "sem_telefone"
      });
    } else {
      await completeWarmScreenItem({
        itemId: item.id,
        executionId,
        status: "completed_error"
      });
    }
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
      contactId: phone.primary_contact_id ?? null,
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
    const productIds = Array.isArray(item.product_ids)
      ? (item.product_ids as number[])
      : typeof item.product_ids === "string"
        ? (JSON.parse(item.product_ids) as number[])
        : [];
    const result = await initiateApi4comCall({
      userId: exec.dial_user_id,
      dialIdentityUserId: exec.dial_user_id,
      clientId: item.client_id,
      contactId: phone.primary_contact_id ?? undefined,
      productId: productIds[0] ?? null,
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
    await handleWarmScreenDialSetupFailure({
      executionId,
      itemId: item.id,
      message
    });
    return { advanced: false, message, execution: await getExecutionById(executionId) };
  }
}
