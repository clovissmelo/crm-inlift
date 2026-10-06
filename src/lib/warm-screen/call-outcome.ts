import { createApproach } from "@/lib/approaches";
import { recordDialAttemptFromApproach } from "@/lib/call-strategy/record-attempt";
import { evaluateProspeccaoQueueAfterAttempt } from "@/lib/call-strategy/queue-eval";
import { getContactOutcomeTypeBySlug } from "@/lib/classifications/contact-commercial";
import { getTechnicalResultTypeById } from "@/lib/classifications/technical-result";
import { listActiveProductIdsInQueue } from "@/lib/client-product-prospeccao";
import { get, nowIso, run } from "@/lib/db";
import { WARM_SCREEN_MOTOR_LABEL } from "@/lib/warm-screen/constants";
import { completeWarmScreenItem } from "@/lib/warm-screen/executions";

type CallRow = {
  id: number;
  user_id: number;
  client_id: number | null;
  contact_id: number | null;
  approach_id: number | null;
  ended_at: string | null;
  started_at: string | null;
  api4com_call_id: string | null;
  technical_result_type_id: number | null;
  metadata_json: string | null;
};

function parseMeta(raw: string | null): Record<string, string> {
  if (!raw?.trim()) return {};
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(j)) {
      if (v != null) out[k] = String(v);
    }
    return out;
  } catch {
    return {};
  }
}

export function isWarmScreenCallRow(row: { metadata_json: string | null }): boolean {
  return parseMeta(row.metadata_json).purpose === "warm_screen";
}

async function afterAttemptForAllProducts(clientId: number) {
  const productIds = await listActiveProductIdsInQueue(clientId);
  if (productIds.length === 0) {
    await evaluateProspeccaoQueueAfterAttempt(clientId, null);
    return;
  }
  for (const productId of productIds) {
    await evaluateProspeccaoQueueAfterAttempt(clientId, productId);
  }
}

/** Finaliza ligação do motor após hangup (erro ou atendeu). */
export async function finalizeWarmScreenCall(callId: number): Promise<boolean> {
  const call = await get<CallRow>(
    `
      SELECT id, user_id, client_id, contact_id, approach_id, ended_at, started_at,
        api4com_call_id, technical_result_type_id, metadata_json
      FROM api4com_calls WHERE id = @id
    `,
    { id: callId }
  );
  if (!call?.client_id || !isWarmScreenCallRow(call)) return false;
  if (call.approach_id) {
    await syncExecutionFromCall(call);
    return true;
  }

  const meta = parseMeta(call.metadata_json);
  const itemId = meta.warm_screen_item_id ? Number(meta.warm_screen_item_id) : null;
  const executionId = meta.warm_screen_execution_id ? Number(meta.warm_screen_execution_id) : null;

  const semContato = await get<{ id: number }>(
    "SELECT id FROM approach_result_types WHERE slug = 'sem_contato' AND status = 'active' LIMIT 1"
  );
  if (!semContato) return false;

  const contactOutcome = await getContactOutcomeTypeBySlug("nenhum_contato");
  if (!contactOutcome) return false;

  let technicalSlug: string | null = null;
  let answered = false;
  if (call.technical_result_type_id) {
    const t = await getTechnicalResultTypeById(call.technical_result_type_id);
    technicalSlug = t?.slug ?? null;
    answered = Boolean(t?.answered);
  }

  const notes = WARM_SCREEN_MOTOR_LABEL;
  const commercialSnapshot = WARM_SCREEN_MOTOR_LABEL;

  if (answered) {
    await run(
      `
        UPDATE clients SET warm_screen_confirmed_at = COALESCE(warm_screen_confirmed_at, @now), updated_at = @now
        WHERE id = @clientId
      `,
      { clientId: call.client_id, now: nowIso() }
    );
  }

  const approachId = await createApproach({
    client_id: call.client_id,
    contact_id: call.contact_id,
    product_id: null,
    user_id: call.user_id,
    channel: "call",
    occurred_at: call.ended_at ?? call.started_at,
    result_type_id: semContato.id,
    notes,
    external_call_id: call.api4com_call_id,
    next_action: { type: "none" },
    api4com_call_row_id: call.id,
    contact_outcome_type_id: contactOutcome.id,
    contact_outcome_name_snapshot: contactOutcome.name,
    commercial_result_name_snapshot: commercialSnapshot,
    technical_result_name_snapshot: technicalSlug,
    registration_status: "final"
  });

  await recordDialAttemptFromApproach({
    approachId,
    clientId: call.client_id,
    userId: call.user_id,
    contactId: call.contact_id,
    productId: null,
    api4comCallRowId: call.id,
    resultTypeId: semContato.id,
    contactOutcomeTypeId: contactOutcome.id
  });

  await afterAttemptForAllProducts(call.client_id);

  await run(
    `
      UPDATE api4com_calls SET approach_id = @approachId, result_pending = false, updated_at = @now
      WHERE id = @id
    `,
    { id: call.id, approachId, now: nowIso() }
  );

  if (itemId && executionId) {
    await completeWarmScreenItem({
      itemId,
      executionId,
      status: answered ? "completed_warmed" : "completed_error",
      callRowId: call.id
    });
  }

  return true;
}

async function syncExecutionFromCall(call: CallRow) {
  const meta = parseMeta(call.metadata_json);
  const itemId = meta.warm_screen_item_id ? Number(meta.warm_screen_item_id) : null;
  const executionId = meta.warm_screen_execution_id ? Number(meta.warm_screen_execution_id) : null;
  if (!itemId || !executionId) return;

  const warmed = await get<{ warm_screen_confirmed_at: string | null }>(
    "SELECT warm_screen_confirmed_at FROM clients WHERE id = @id",
    { id: call.client_id! }
  );
  await completeWarmScreenItem({
    itemId,
    executionId,
    status: warmed?.warm_screen_confirmed_at ? "completed_warmed" : "completed_error",
    callRowId: call.id
  });
}
