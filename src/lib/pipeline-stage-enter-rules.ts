import {
  APPROACH_NEXT_ACTION_LABELS,
  parseAllowedNextActions,
  serializeAllowedNextActions,
  type ApproachNextActionKey
} from "@/lib/approach-next-actions";
export type PipelineStageEnterConfig = {
  enter_collect_notes?: boolean;
  enter_allowed_next_actions?: string | null;
  enter_require_next_action?: boolean;
};

/** Próximos passos configuráveis ao entrar em uma etapa do funil. */
export const STAGE_ENTER_NEXT_ACTION_KEYS: ApproachNextActionKey[] = [
  "schedule_return",
  "schedule_meeting",
  "pause"
];

export type PipelineStageEnterRules = {
  enter_collect_notes: boolean;
  enter_allowed_next_actions: ApproachNextActionKey[];
  enter_require_next_action: boolean;
};

export type StageEnterActionPayload = {
  type: "schedule_return" | "schedule_meeting" | "pause";
  scheduled_at?: string;
  notes?: string | null;
  reason_id?: number;
};

export function parsePipelineStageEnterRules(stage: PipelineStageEnterConfig): PipelineStageEnterRules {
  const allowed = parseAllowedNextActions(stage.enter_allowed_next_actions).filter((k) =>
    STAGE_ENTER_NEXT_ACTION_KEYS.includes(k)
  );
  return {
    enter_collect_notes: stage.enter_collect_notes === true,
    enter_allowed_next_actions: allowed,
    enter_require_next_action: stage.enter_require_next_action === true
  };
}

export function stageEnterPromptRequired(rules: PipelineStageEnterRules): boolean {
  return rules.enter_collect_notes || rules.enter_allowed_next_actions.length > 0;
}

export function stageEnterActionLabels(keys: ApproachNextActionKey[]): string {
  if (!keys.length) return "—";
  return keys.map((k) => APPROACH_NEXT_ACTION_LABELS[k]).join(", ");
}

export function serializeStageEnterAllowedActions(keys: ApproachNextActionKey[]): string | null {
  const filtered = STAGE_ENTER_NEXT_ACTION_KEYS.filter((k) => keys.includes(k));
  if (!filtered.length) return null;
  return serializeAllowedNextActions(filtered);
}

export function validateStageEnterPayload(
  rules: PipelineStageEnterRules,
  input: { enter_notes?: string | null; enter_action?: StageEnterActionPayload | null }
): string | null {
  if (!stageEnterPromptRequired(rules)) return null;

  if (rules.enter_collect_notes && !(input.enter_notes ?? "").trim()) {
    return "Informe a observação para concluir a movimentação.";
  }

  const allowed = rules.enter_allowed_next_actions;
  const action = input.enter_action ?? null;

  if (rules.enter_require_next_action && allowed.length > 0 && !action) {
    return "Escolha o próximo passo ao entrar nesta etapa.";
  }

  if (action && !allowed.includes(action.type)) {
    return "Próximo passo não permitido para esta etapa.";
  }

  if (action?.type === "schedule_return" || action?.type === "schedule_meeting") {
    if (!action.scheduled_at?.trim()) {
      return "Informe data e horário para agendar.";
    }
  }

  if (action?.type === "pause" && !action.reason_id) {
    return "Selecione o motivo da pausa.";
  }

  return null;
}
