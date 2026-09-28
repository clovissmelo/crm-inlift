import { defaultNextTypeForResult, resolveAllowedNextActions } from "@/lib/approach-next-actions";
import { inferApproachResultSlugFromCall } from "@/lib/api4com/infer-approach-result";

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

/** Registro automático quando o resultado inferido não exige complemento manual. */
export async function tryAutoRegisterApi4comCall(callId: number): Promise<boolean> {
  const callRes = await fetch(`/api/api4com/calls/${callId}`);
  if (!callRes.ok) return false;
  const callJson = (await callRes.json()) as { call?: CallRow };
  const call = callJson.call;
  if (!call?.client_id) return false;

  const slug = inferApproachResultSlugFromCall(call);
  if (!slug) return false;

  const rtRes = await fetch("/api/approach-result-types");
  if (!rtRes.ok) return false;
  const rtJson = (await rtRes.json()) as { items?: ResultTypeRow[] };
  const resultType = rtJson.items?.find((r) => r.slug === slug && r.require_final_registration === false);
  if (!resultType) return false;

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
      notes: null,
      external_call_id: call.api4com_call_id,
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
