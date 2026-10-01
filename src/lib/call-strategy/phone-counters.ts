import { get, nowIso, run } from "@/lib/db";
import { getCallStrategySettings } from "@/lib/call-strategy/settings";
import {
  formatCounterLine,
  type OccurrenceKind,
  type DialOccurrencePolicy
} from "@/lib/call-strategy/occurrence-policy-shared";

export type PhoneCounterState = {
  cycle_no_answer_count: number;
  cycle_invalid_count: number;
  cycle_wrong_number_count: number;
  status: string;
  needs_review: boolean;
  last_occurrence_kind: string | null;
};

export type PhoneCounterCounts = Pick<
  PhoneCounterState,
  "cycle_no_answer_count" | "cycle_invalid_count" | "cycle_wrong_number_count"
>;

export function readCountForKind(state: PhoneCounterCounts, kind: OccurrenceKind): number {
  if (kind === "no_answer") return state.cycle_no_answer_count;
  if (kind === "invalid") return state.cycle_invalid_count;
  if (kind === "wrong_number") return state.cycle_wrong_number_count;
  return 0;
}

export async function getGlobalLimitForKind(kind: OccurrenceKind): Promise<number> {
  const settings = await getCallStrategySettings();
  if (kind === "no_answer") return settings.max_no_answer_attempts;
  if (kind === "invalid") return settings.max_invalid_attempts;
  if (kind === "wrong_number") return settings.max_wrong_number_attempts;
  return 0;
}

export function buildCounterLines(
  state: PhoneCounterState,
  limits: Partial<Record<OccurrenceKind, number>>
): string[] {
  const lines: string[] = [];
  const kinds: OccurrenceKind[] = ["no_answer", "invalid", "wrong_number"];
  for (const kind of kinds) {
    const count = readCountForKind(state, kind);
    const limit = limits[kind] ?? 0;
    if (count > 0 || state.last_occurrence_kind === kind) {
      lines.push(formatCounterLine(kind, count, limit || 3));
    }
  }
  return lines;
}

export async function applyOccurrenceToPhoneState(
  clientPhoneId: number,
  policy: DialOccurrencePolicy
): Promise<void> {
  const now = nowIso();
  if (!policy.counts || !policy.kind || policy.kind === "conversation_success") {
    if (policy.kind === "conversation_success") {
      await run(
        `
          INSERT INTO client_phone_dial_state (
            client_phone_id, status, cycle_no_answer_count, cycle_invalid_count, cycle_wrong_number_count,
            next_eligible_at, needs_review, last_occurrence_kind, updated_at
          ) VALUES (@phoneId, 'available', 0, 0, 0, NULL, false, @kind, @now)
          ON CONFLICT (client_phone_id) DO UPDATE SET
            status = 'available',
            cycle_no_answer_count = 0,
            cycle_invalid_count = 0,
            cycle_wrong_number_count = 0,
            next_eligible_at = NULL,
            needs_review = false,
            last_occurrence_kind = @kind,
            updated_at = EXCLUDED.updated_at
        `,
        { phoneId: clientPhoneId, kind: policy.kind, now }
      );
    }
    return;
  }

  if (policy.kind === "technical_fail") return;

  const st = await get<PhoneCounterState>(
    `
      SELECT cycle_no_answer_count, cycle_invalid_count, cycle_wrong_number_count,
        status, COALESCE(needs_review, false) AS needs_review, last_occurrence_kind
      FROM client_phone_dial_state WHERE client_phone_id = @phoneId
    `,
    { phoneId: clientPhoneId }
  );
  let noAnswer = st?.cycle_no_answer_count ?? 0;
  let invalid = st?.cycle_invalid_count ?? 0;
  let wrong = st?.cycle_wrong_number_count ?? 0;

  if (policy.kind === "no_answer") noAnswer += 1;
  else if (policy.kind === "invalid") invalid += 1;
  else if (policy.kind === "wrong_number") wrong += 1;

  const currentCount =
    policy.kind === "no_answer" ? noAnswer : policy.kind === "invalid" ? invalid : wrong;

  const intervalMs = policy.minIntervalMinutes * 60 * 1000;
  const nextEligible = new Date(Date.now() + intervalMs).toISOString();
  const hitLimit = currentCount >= policy.limit;

  let status = st?.status ?? "available";
  let needsReview = st?.needs_review ?? false;
  let exhaustedAt: string | null = null;
  let exhaustionReason: string | null = null;

  if (hitLimit) {
    if (policy.limitAction === "flag_review") {
      status = "waiting";
      needsReview = true;
      exhaustionReason = `Limite ${policy.kind} (${policy.limit}) — revisão`;
    } else {
      status = "exhausted";
      needsReview = false;
      exhaustedAt = now;
      exhaustionReason = `Limite ${policy.kind} (${policy.limit})`;
    }
  } else {
    status = "waiting";
    needsReview = false;
  }

  await run(
    `
      INSERT INTO client_phone_dial_state (
        client_phone_id, status, cycle_no_answer_count, cycle_invalid_count, cycle_wrong_number_count,
        next_eligible_at, exhausted_at, needs_review, exhaustion_reason, last_occurrence_kind, updated_at
      ) VALUES (
        @phoneId, @status, @noAnswer, @invalid, @wrong,
        @nextEligible, @exhaustedAt, @needsReview, @exhaustionReason, @kind, @now
      )
      ON CONFLICT (client_phone_id) DO UPDATE SET
        status = EXCLUDED.status,
        cycle_no_answer_count = EXCLUDED.cycle_no_answer_count,
        cycle_invalid_count = EXCLUDED.cycle_invalid_count,
        cycle_wrong_number_count = EXCLUDED.cycle_wrong_number_count,
        next_eligible_at = CASE WHEN EXCLUDED.status = 'exhausted' THEN NULL ELSE EXCLUDED.next_eligible_at END,
        exhausted_at = CASE WHEN EXCLUDED.status = 'exhausted' THEN COALESCE(client_phone_dial_state.exhausted_at, EXCLUDED.exhausted_at) ELSE client_phone_dial_state.exhausted_at END,
        needs_review = EXCLUDED.needs_review,
        exhaustion_reason = EXCLUDED.exhaustion_reason,
        last_occurrence_kind = EXCLUDED.last_occurrence_kind,
        updated_at = EXCLUDED.updated_at
    `,
    {
      phoneId: clientPhoneId,
      status,
      noAnswer,
      invalid,
      wrong,
      nextEligible: status === "exhausted" ? null : nextEligible,
      exhaustedAt,
      needsReview,
      exhaustionReason,
      kind: policy.kind,
      now
    }
  );
}
