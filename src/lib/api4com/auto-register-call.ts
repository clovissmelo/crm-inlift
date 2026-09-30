import { defaultNextTypeForResult, resolveAllowedNextActions } from "@/lib/approach-next-actions";
import {
  matchTechnicalResultFromCatalog,
  type TechnicalResultTypeRow
} from "@/lib/classifications/technical-result-match";

type ResultTypeRow = {
  id: number;
  slug: string;
  require_final_registration: boolean;
  require_schedule_return: boolean;
  suggest_follow_up: boolean;
  allowed_next_actions: unknown;
};

type CallRow = {
  id: number;
  client_id: number | null;
  contact_id: number | null;
  product_id: number | null;
  api4com_call_id: string | null;
  ended_at: string | null;
  started_at: string | null;
  hangup_cause_code: string | null;
  hangup_cause_label: string | null;
  duration_seconds: number | null;
  answered_at: string | null;
};

/** Registro automático quando o resultado técnico indica sem conversa e o comercial não exige complemento. */
export async function tryAutoRegisterApi4comCall(callId: number): Promise<boolean> {
  const callRes = await fetch(`/api/api4com/calls/${callId}`);
  if (!callRes.ok) return false;
  const callJson = (await callRes.json()) as { call?: CallRow };
  const call = callJson.call;
  if (!call?.client_id) return false;

  const classRes = await fetch("/api/approach-classifications");
  if (!classRes.ok) return false;
  const classJson = (await classRes.json()) as {
    technical?: TechnicalResultTypeRow[];
    contact?: Array<{ id: number; slug: string }>;
    commercial?: ResultTypeRow[];
  };

  const techSlug =
    matchTechnicalResultFromCatalog(classJson.technical ?? [], call)?.slug ??
    null;
  if (!techSlug || techSlug === "answered") return false;

  const resultType = classJson.commercial?.find(
    (r) => r.slug === "sem_contato" && r.require_final_registration === false
  );
  const contactOutcome = classJson.contact?.find((c) => c.slug === "nenhum_contato");
  if (!resultType || !contactOutcome) return false;

  const allowed = resolveAllowedNextActions(resultType);
  const nextKey = defaultNextTypeForResult(resultType);
  let next_action: Record<string, unknown> = { type: "none" };
  if (nextKey !== "none" && allowed.includes(nextKey)) {
    next_action = { type: nextKey };
  }

  const approachRes = await fetch("/api/approaches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: call.client_id,
      contact_id: call.contact_id,
      product_id: call.product_id,
      channel: "call",
      occurred_at: call.ended_at ?? call.started_at,
      result_type_id: resultType.id,
      contact_outcome_type_id: contactOutcome.id,
      api4com_call_row_id: call.id,
      notes: null,
      external_call_id: call.api4com_call_id,
      registration_status: "final",
      next_action
    })
  });
  if (!approachRes.ok) return false;
  const approachJson = (await approachRes.json()) as { id?: number };
  if (approachJson.id) {
    await fetch(`/api/api4com/calls/${call.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approach_id: approachJson.id })
    });
  }
  return true;
}
