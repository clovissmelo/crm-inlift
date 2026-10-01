import { getActiveAssociationForPair } from "@/lib/classifications/result-associations";
import { getCallStrategySettings } from "@/lib/call-strategy/settings";
import {
  type DialOccurrencePolicy,
  type OccurrenceKind
} from "@/lib/call-strategy/occurrence-policy-shared";

export type { DialOccurrencePolicy, OccurrenceKind } from "@/lib/call-strategy/occurrence-policy-shared";
export {
  formatCounterLine,
  formatOccurrenceSummary,
  OCCURRENCE_KIND_LABELS
} from "@/lib/call-strategy/occurrence-policy-shared";

const DEFAULT_LIMITS: Record<string, keyof Awaited<ReturnType<typeof getCallStrategySettings>>> = {
  no_answer: "max_no_answer_attempts",
  invalid: "max_invalid_attempts",
  wrong_number: "max_wrong_number_attempts"
};

export async function resolveDialOccurrencePolicy(input: {
  technicalTypeId: number | null;
  commercialTypeId: number;
  contactOutcomeSlug: string | null;
  technicalSlug: string | null;
  commercialSlug: string | null;
}): Promise<DialOccurrencePolicy> {
  const settings = await getCallStrategySettings();
  const fallbackInterval = settings.min_interval_minutes;

  if (input.technicalSlug === "call_failed") {
    return {
      counts: false,
      kind: "technical_fail",
      limit: 0,
      minIntervalMinutes: fallbackInterval,
      limitAction: "exhaust_phone",
      associationId: null
    };
  }

  let association =
    input.technicalTypeId != null
      ? await getActiveAssociationForPair(input.technicalTypeId, input.commercialTypeId)
      : null;

  if (!association && input.technicalTypeId == null) {
    association = null;
  }

  let kind: OccurrenceKind | null =
    (association?.dial_occurrence_kind as OccurrenceKind | null) ?? null;

  if (
    input.contactOutcomeSlug === "falou_outra_pessoa" &&
    input.commercialSlug === "sem_contato"
  ) {
    kind = "wrong_number";
  } else if (!kind && input.technicalSlug === "invalid_number") {
    kind = "invalid";
  } else if (!kind && (input.technicalSlug === "no_answer" || input.technicalSlug === "busy")) {
    kind = "no_answer";
  } else if (!kind && input.technicalSlug === "answered") {
    if (input.contactOutcomeSlug === "nenhum_contato") kind = "no_answer";
    else kind = "conversation_success";
  }

  let counts =
    Boolean(association?.dial_counts_for_exhaustion) &&
    kind !== "conversation_success" &&
    kind !== "technical_fail";

  if (
    !counts &&
    kind === "wrong_number" &&
    input.contactOutcomeSlug === "falou_outra_pessoa" &&
    association?.dial_occurrence_kind === "wrong_number"
  ) {
    counts = Boolean(association.dial_counts_for_exhaustion);
  }

  if (!counts) {
    return {
      counts: false,
      kind,
      limit: 0,
      minIntervalMinutes: association?.dial_min_interval_minutes ?? fallbackInterval,
      limitAction: (association?.dial_limit_action as DialOccurrencePolicy["limitAction"]) ?? "exhaust_phone",
      associationId: association?.id ?? null
    };
  }

  const limitKey = kind ? DEFAULT_LIMITS[kind] : undefined;
  const globalLimit =
    limitKey && kind
      ? (settings[limitKey as keyof typeof settings] as number)
      : 3;

  return {
    counts: true,
    kind,
    limit: association?.dial_occurrence_limit ?? globalLimit,
    minIntervalMinutes: association?.dial_min_interval_minutes ?? fallbackInterval,
    limitAction:
      (association?.dial_limit_action as DialOccurrencePolicy["limitAction"]) ?? "exhaust_phone",
    associationId: association?.id ?? null
  };
}
