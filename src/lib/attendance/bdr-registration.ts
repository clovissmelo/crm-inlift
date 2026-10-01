import { enforceRulesForAction, type OperationalAction } from "@/lib/attendance/operational-actions";

export type AttendanceRuleForUi = {
  answered: boolean;
  operational_action: OperationalAction;
  commercial_result_type_id: number | null;
  name: string;
};

export type CommercialPick = {
  id: number;
  slug: string;
  name: string;
};

/** Resultados comerciais permitidos para ligação atendida (fonte: attendance_rules). */
export function listAnsweredCommercialOptions(
  rules: AttendanceRuleForUi[],
  catalog: CommercialPick[]
): CommercialPick[] {
  const ids = new Set(
    rules
      .filter((r) => r.answered && r.operational_action !== "auto_no_contact")
      .map((r) => r.commercial_result_type_id)
      .filter((id): id is number => id != null)
  );
  if (ids.size === 0) return catalog;
  return catalog.filter((c) => ids.has(c.id));
}

export function filterCommercialByContactCompat(
  options: CommercialPick[],
  contactOutcomeTypeId: string | number | null,
  compatMap: Record<string, number[]>
): CommercialPick[] {
  if (!contactOutcomeTypeId) return options;
  const compat = compatMap[String(contactOutcomeTypeId)];
  if (!compat?.length) return options;
  const set = new Set(compat);
  return options.filter((c) => set.has(c.id));
}

export function resolveAllowedCommercialIds(
  rules: AttendanceRuleForUi[],
  catalog: CommercialPick[],
  contactOutcomeTypeId: string | null,
  compatMap: Record<string, number[]>
): number[] | null {
  const base = listAnsweredCommercialOptions(rules, catalog);
  const filtered = filterCommercialByContactCompat(base, contactOutcomeTypeId, compatMap);
  if (rules.length === 0) return null;
  return filtered.map((c) => c.id);
}

export type EffectiveBdrRules = ReturnType<typeof enforceRulesForAction> & {
  lead_qualification?: string | null;
  slug?: string;
};

export function resolveEffectiveBdrRules(
  commercial: CommercialPick & {
    collect_notes?: boolean;
    require_schedule_return?: boolean;
    require_final_registration?: boolean;
    ask_decision_maker?: boolean;
    allowed_next_actions?: unknown;
    lead_qualification?: string | null;
  },
  rules: AttendanceRuleForUi[]
): EffectiveBdrRules {
  const rule = rules.find((r) => r.commercial_result_type_id === commercial.id);
  if (!rule) {
    return {
      collect_notes: commercial.collect_notes !== false,
      require_schedule_return: commercial.require_schedule_return === true,
      require_final_registration: commercial.require_final_registration !== false,
      ask_decision_maker: commercial.ask_decision_maker === true,
      mark_phone_verified: false,
      requires_meeting: false,
      allowed_next_actions: (commercial.allowed_next_actions as EffectiveBdrRules["allowed_next_actions"]) ?? [
        "none"
      ],
      requires_non_none_next: false,
      exit_prospeccao_product: false,
      move_pipeline_lost: false,
      slug: commercial.slug,
      lead_qualification: commercial.lead_qualification ?? null
    };
  }
  return {
    ...enforceRulesForAction(rule.operational_action),
    slug: commercial.slug,
    lead_qualification: commercial.lead_qualification ?? null
  };
}
