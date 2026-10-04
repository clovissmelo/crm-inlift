import {
  parseAllowedNextActions,
  RESULT_REGISTRATION_ACTION_KEYS,
  type ApproachNextActionKey
} from "@/lib/approach-next-actions";
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

function catalogAllowedNextActions(raw: unknown): ApproachNextActionKey[] {
  const parsed = parseAllowedNextActions(raw).filter((k) => RESULT_REGISTRATION_ACTION_KEYS.includes(k));
  return parsed.length > 0 ? parsed : ["none"];
}

function catalogRegistrationRules(
  commercial: CommercialPick & {
    collect_notes?: boolean;
    require_schedule_return?: boolean;
    require_final_registration?: boolean;
    ask_decision_maker?: boolean;
    mark_phone_verified?: boolean;
    requires_meeting?: boolean;
    allowed_next_actions?: unknown;
  }
) {
  const allowed_next_actions = catalogAllowedNextActions(commercial.allowed_next_actions);
  return {
    collect_notes: commercial.collect_notes === true,
    require_schedule_return: commercial.require_schedule_return === true,
    require_final_registration: commercial.require_final_registration !== false,
    ask_decision_maker: commercial.ask_decision_maker === true,
    mark_phone_verified: commercial.mark_phone_verified === true,
    requires_meeting: commercial.requires_meeting === true,
    allowed_next_actions,
    requires_non_none_next: allowed_next_actions.some((k) => k !== "none")
  };
}

export function resolveEffectiveBdrRules(
  commercial: CommercialPick & {
    collect_notes?: boolean;
    require_schedule_return?: boolean;
    require_final_registration?: boolean;
    ask_decision_maker?: boolean;
    mark_phone_verified?: boolean;
    requires_meeting?: boolean;
    allowed_next_actions?: unknown;
    lead_qualification?: string | null;
  },
  rules: AttendanceRuleForUi[]
): EffectiveBdrRules {
  const catalog = catalogRegistrationRules(commercial);
  const rule = rules.find((r) => r.commercial_result_type_id === commercial.id);
  if (!rule) {
    return {
      ...catalog,
      exit_prospeccao_product: false,
      move_pipeline_lost: false,
      slug: commercial.slug,
      lead_qualification: commercial.lead_qualification ?? null
    };
  }
  const enforced = enforceRulesForAction(rule.operational_action);
  return {
    ...enforced,
    collect_notes: catalog.collect_notes,
    require_schedule_return: catalog.require_schedule_return,
    require_final_registration: catalog.require_final_registration,
    ask_decision_maker: catalog.ask_decision_maker,
    allowed_next_actions: catalog.allowed_next_actions,
    requires_non_none_next: catalog.requires_non_none_next,
    requires_meeting: catalog.requires_meeting || enforced.requires_meeting,
    mark_phone_verified: catalog.mark_phone_verified || enforced.mark_phone_verified,
    slug: commercial.slug,
    lead_qualification: commercial.lead_qualification ?? null
  };
}
