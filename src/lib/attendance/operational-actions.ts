import type { ApproachNextActionKey } from "@/lib/approach-next-actions";

export type OperationalAction =
  | "auto_no_contact"
  | "sem_contato"
  | "pediu_retorno"
  | "demonstrou_interesse"
  | "sem_interesse"
  | "reuniao_agendada";

export const OPERATIONAL_ACTION_LABELS: Record<OperationalAction, string> = {
  auto_no_contact: "Não atendeu (automático)",
  sem_contato: "Sem contato humano",
  pediu_retorno: "Pediu retorno",
  demonstrou_interesse: "Demonstrou interesse",
  sem_interesse: "Sem interesse",
  reuniao_agendada: "Reunião agendada"
};

/** Regras de registro derivadas da ação — não editáveis separadamente no admin. */
export type EnforcedRegistrationRules = {
  collect_notes: boolean;
  require_schedule_return: boolean;
  require_final_registration: boolean;
  ask_decision_maker: boolean;
  mark_phone_verified: boolean;
  requires_meeting: boolean;
  allowed_next_actions: ApproachNextActionKey[];
  requires_non_none_next: boolean;
  exit_prospeccao_product: boolean;
  move_pipeline_lost: boolean;
};

export function enforceRulesForAction(action: OperationalAction): EnforcedRegistrationRules {
  switch (action) {
    case "auto_no_contact":
      return {
        collect_notes: false,
        require_schedule_return: false,
        require_final_registration: false,
        ask_decision_maker: false,
        mark_phone_verified: false,
        requires_meeting: false,
        allowed_next_actions: ["none"],
        requires_non_none_next: false,
        exit_prospeccao_product: false,
        move_pipeline_lost: false
      };
    case "sem_contato":
      return {
        collect_notes: false,
        require_schedule_return: false,
        require_final_registration: true,
        ask_decision_maker: false,
        mark_phone_verified: false,
        requires_meeting: false,
        allowed_next_actions: ["none"],
        requires_non_none_next: false,
        exit_prospeccao_product: false,
        move_pipeline_lost: false
      };
    case "pediu_retorno":
      return {
        collect_notes: true,
        require_schedule_return: true,
        require_final_registration: true,
        ask_decision_maker: false,
        mark_phone_verified: true,
        requires_meeting: false,
        allowed_next_actions: ["schedule_return"],
        requires_non_none_next: true,
        exit_prospeccao_product: false,
        move_pipeline_lost: false
      };
    case "demonstrou_interesse":
      return {
        collect_notes: true,
        require_schedule_return: false,
        require_final_registration: true,
        ask_decision_maker: false,
        mark_phone_verified: true,
        requires_meeting: false,
        allowed_next_actions: ["schedule_return", "schedule_meeting"],
        requires_non_none_next: true,
        exit_prospeccao_product: false,
        move_pipeline_lost: false
      };
    case "sem_interesse":
      return {
        collect_notes: true,
        require_schedule_return: false,
        require_final_registration: true,
        ask_decision_maker: true,
        mark_phone_verified: true,
        requires_meeting: false,
        allowed_next_actions: ["close"],
        requires_non_none_next: true,
        exit_prospeccao_product: true,
        move_pipeline_lost: true
      };
    case "reuniao_agendada":
      return {
        collect_notes: true,
        require_schedule_return: false,
        require_final_registration: true,
        ask_decision_maker: false,
        mark_phone_verified: true,
        requires_meeting: true,
        allowed_next_actions: ["schedule_meeting"],
        requires_non_none_next: true,
        exit_prospeccao_product: true,
        move_pipeline_lost: false
      };
    default:
      return enforceRulesForAction("sem_contato");
  }
}

/** Etapa exibida e sugerida para quem permanece na prospecção (fila / retorno). */
export const PROSPECCAO_PIPELINE_STAGE_NAME = "Prospecção";

export function isFixedProspeccaoFunnelAction(action: OperationalAction): boolean {
  return action === "auto_no_contact" || action === "sem_contato";
}

export function defaultPipelineStageNameForAction(action: OperationalAction): string | null {
  switch (action) {
    case "pediu_retorno":
      return PROSPECCAO_PIPELINE_STAGE_NAME;
    case "demonstrou_interesse":
      return "Interessados";
    case "reuniao_agendada":
      return "Agendado";
    case "sem_interesse":
      return "Perdido";
    default:
      return null;
  }
}
