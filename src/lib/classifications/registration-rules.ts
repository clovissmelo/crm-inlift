import {
  formatAllowedNextActionsSummary,
  parseAllowedNextActions,
  resolveAllowedNextActions,
  type ApproachNextActionKey
} from "@/lib/approach-next-actions";

export type CommercialRegistrationDefaults = {
  collect_notes: boolean;
  require_schedule_return: boolean;
  require_final_registration: boolean;
  ask_decision_maker: boolean;
  mark_phone_verified: boolean;
  allowed_next_actions: unknown;
  suggest_follow_up?: boolean;
  requires_meeting?: boolean;
  lead_qualification?: string | null;
};

export type AssociationRuleOverrides = {
  collect_notes: boolean | null;
  require_schedule_return: boolean | null;
  require_final_registration: boolean | null;
  ask_decision_maker: boolean | null;
  mark_phone_verified: boolean | null;
  allowed_next_actions: unknown | null;
};

export type AssociationRulePayload = AssociationRuleOverrides & {
  id?: number;
  call_technical_result_type_id: number;
  commercial_result_type_id: number;
  pipeline_stage_id?: number | null;
  status?: string;
};

export function associationOverrides(row: AssociationRuleOverrides | null | undefined): AssociationRuleOverrides | null {
  if (!row) return null;
  return {
    collect_notes: row.collect_notes,
    require_schedule_return: row.require_schedule_return,
    require_final_registration: row.require_final_registration,
    ask_decision_maker: row.ask_decision_maker,
    mark_phone_verified: row.mark_phone_verified,
    allowed_next_actions: row.allowed_next_actions
  };
}

export type EffectiveRegistrationRules = {
  collect_notes: boolean;
  require_schedule_return: boolean;
  require_final_registration: boolean;
  ask_decision_maker: boolean;
  mark_phone_verified: boolean;
  allowed_next_actions: ApproachNextActionKey[];
  suggest_follow_up: boolean;
  requires_meeting: boolean;
  lead_qualification: string | null;
};

export function mergeRegistrationRules(
  commercial: Partial<CommercialRegistrationDefaults>,
  association: AssociationRuleOverrides | null
): EffectiveRegistrationRules {
  const base: CommercialRegistrationDefaults = {
    collect_notes: commercial.collect_notes ?? false,
    require_schedule_return: commercial.require_schedule_return ?? false,
    require_final_registration: commercial.require_final_registration ?? true,
    ask_decision_maker: commercial.ask_decision_maker ?? false,
    mark_phone_verified: commercial.mark_phone_verified ?? false,
    allowed_next_actions: commercial.allowed_next_actions,
    suggest_follow_up: commercial.suggest_follow_up,
    requires_meeting: commercial.requires_meeting,
    lead_qualification: commercial.lead_qualification ?? null
  };
  const parsedAssoc = association?.allowed_next_actions
    ? parseAllowedNextActions(association.allowed_next_actions)
    : null;
  const baseAllowed = resolveAllowedNextActions(base);
  const allowed =
    parsedAssoc && parsedAssoc.length > 0
      ? parsedAssoc
      : baseAllowed;

  return {
    collect_notes: association?.collect_notes ?? base.collect_notes,
    require_schedule_return: association?.require_schedule_return ?? base.require_schedule_return,
    require_final_registration:
      association?.require_final_registration ?? base.require_final_registration,
    ask_decision_maker: association?.ask_decision_maker ?? base.ask_decision_maker,
    mark_phone_verified: association?.mark_phone_verified ?? base.mark_phone_verified,
    allowed_next_actions: allowed,
    suggest_follow_up: base.suggest_follow_up ?? false,
    requires_meeting: base.requires_meeting ?? false,
    lead_qualification: base.lead_qualification ?? null
  };
}

export function formatRequiredInfoSummary(rules: Pick<
  EffectiveRegistrationRules,
  | "collect_notes"
  | "require_schedule_return"
  | "ask_decision_maker"
  | "require_final_registration"
  | "allowed_next_actions"
>): string {
  const parts: string[] = [];
  if (rules.ask_decision_maker) parts.push("Decisor");
  if (rules.collect_notes) parts.push("Observação");
  if (rules.require_schedule_return) parts.push("Retorno");
  const next = formatAllowedNextActionsSummary({ allowed_next_actions: rules.allowed_next_actions });
  if (next && next !== "—" && !next.startsWith("Nenhum")) parts.push(next);
  if (rules.require_final_registration === false) parts.push("Registro simplificado");
  if (parts.length === 0) return "Padrão do resultado comercial";
  return parts.join(" · ");
}
