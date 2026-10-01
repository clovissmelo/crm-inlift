import { getContactOutcomeTypeBySlug } from "@/lib/classifications/contact-commercial";
import { recordDialAttemptFromApproach } from "@/lib/call-strategy/record-attempt";
import { createApproach } from "@/lib/approaches";
import { get, run, nowIso } from "@/lib/db";
import { getAttendanceRuleBySlug } from "@/lib/attendance/rules-repo";

const AUTO_TECH_SLUGS = new Set(["no_answer", "busy", "invalid_number"]);

/** Registra tentativa automática pós-webhook para não-atendimento (sem modal BDR). */
export async function tryServerAutoRegisterNoContact(callId: number): Promise<boolean> {
  const call = await get<{
    id: number;
    user_id: number;
    client_id: number | null;
    contact_id: number | null;
    product_id: number | null;
    technical_result_type_id: number | null;
    approach_id: number | null;
    ended_at: string | null;
    started_at: string | null;
    api4com_call_id: string | null;
    result_pending: boolean;
  }>(
    `
      SELECT id, user_id, client_id, contact_id, product_id, technical_result_type_id,
        approach_id, ended_at, started_at, api4com_call_id, result_pending
      FROM api4com_calls WHERE id = @id
    `,
    { id: callId }
  );
  if (!call?.client_id || call.approach_id) return false;

  const dup = await get<{ id: number }>(
    "SELECT id FROM approaches WHERE api4com_call_row_id = @callId LIMIT 1",
    { callId }
  );
  if (dup) return false;

  let technicalSlug: string | null = null;
  if (call.technical_result_type_id) {
    const t = await get<{ slug: string; answered: boolean }>(
      "SELECT slug, answered FROM call_technical_result_types WHERE id = @id",
      { id: call.technical_result_type_id }
    );
    if (t?.answered) return false;
    technicalSlug = t?.slug ?? null;
  }
  if (!technicalSlug || !AUTO_TECH_SLUGS.has(technicalSlug)) return false;
  if (technicalSlug === "call_failed") return false;

  const semContato = await get<{ id: number }>(
    "SELECT id FROM approach_result_types WHERE slug = 'sem_contato' AND status = 'active' LIMIT 1"
  );
  if (!semContato) return false;

  const contactOutcome = await getContactOutcomeTypeBySlug("nenhum_contato");
  if (!contactOutcome) return false;

  const rule = await getAttendanceRuleBySlug("auto_no_contact");
  if (rule && rule.status !== "active") return false;

  const approachId = await createApproach({
    client_id: call.client_id,
    contact_id: call.contact_id,
    product_id: call.product_id,
    user_id: call.user_id,
    channel: "call",
    occurred_at: call.ended_at ?? call.started_at,
    result_type_id: semContato.id,
    notes: null,
    external_call_id: call.api4com_call_id,
    next_action: { type: "none" },
    api4com_call_row_id: call.id,
    contact_outcome_type_id: contactOutcome.id,
    contact_outcome_name_snapshot: contactOutcome.name,
    commercial_result_name_snapshot: "Sem contato (automático)",
    technical_result_name_snapshot: technicalSlug,
    registration_status: "final"
  });

  await recordDialAttemptFromApproach({
    approachId,
    clientId: call.client_id,
    userId: call.user_id,
    contactId: call.contact_id,
    productId: call.product_id,
    api4comCallRowId: call.id,
    resultTypeId: semContato.id,
    contactOutcomeTypeId: contactOutcome.id
  });

  await run(
    `
      UPDATE api4com_calls SET
        approach_id = @approachId,
        result_pending = false,
        updated_at = @now
      WHERE id = @id
    `,
    { id: call.id, approachId, now: nowIso() }
  );

  return true;
}
