export const APPROACH_NEXT_ACTION_KEYS = [
  "none",
  "schedule_return",
  "schedule_meeting",
  "pause",
  "close"
] as const;

export type ApproachNextActionKey = (typeof APPROACH_NEXT_ACTION_KEYS)[number];

export const APPROACH_NEXT_ACTION_LABELS: Record<ApproachNextActionKey, string> = {
  none: "Nenhum",
  schedule_return: "Agendar retorno",
  schedule_meeting: "Agendar reunião",
  pause: "Pausar oportunidade",
  close: "Encerrar oportunidade"
};

/** Opções exibidas no cadastro de resultado comercial (sem pausar). */
export const RESULT_REGISTRATION_ACTION_KEYS: ApproachNextActionKey[] = [
  "none",
  "schedule_return",
  "schedule_meeting",
  "close"
];

export type ApproachResultNextRules = {
  allowed_next_actions?: unknown;
  require_schedule_return?: boolean;
  requires_meeting?: boolean;
  require_final_registration?: boolean;
  suggest_follow_up?: boolean;
};

/** Exige escolher um próximo passo diferente de Nenhum (quando Nenhum ainda está entre as opções). */
export function requiresNonNoneNextStep(row: ApproachResultNextRules): boolean {
  if (row.require_schedule_return || row.requires_meeting) return true;
  const allowed = resolveAllowedNextActions(row);
  const hasAlternatives = allowed.some((k) => k !== "none");
  if (!hasAlternatives) return false;
  if (row.require_final_registration && allowed.includes("none")) return true;
  if (row.suggest_follow_up && allowed.includes("none")) return true;
  return false;
}

export function deriveSuggestFollowUpFromRules(row: ApproachResultNextRules): boolean {
  return requiresNonNoneNextStep(row);
}

export function parseAllowedNextActions(raw: unknown): ApproachNextActionKey[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<ApproachNextActionKey>();
  for (const item of raw) {
    if (typeof item === "string" && APPROACH_NEXT_ACTION_KEYS.includes(item as ApproachNextActionKey)) {
      set.add(item as ApproachNextActionKey);
    }
  }
  return APPROACH_NEXT_ACTION_KEYS.filter((k) => set.has(k));
}

export function resolveAllowedNextActions(row: ApproachResultNextRules): ApproachNextActionKey[] {
  const explicit = parseAllowedNextActions(row.allowed_next_actions);
  if (explicit.length > 0) return explicit;
  if (row.requires_meeting) return ["schedule_meeting"];
  if (row.require_schedule_return) return ["schedule_return"];
  if (row.suggest_follow_up) {
    return ["none", "schedule_return", "schedule_meeting", "pause", "close"];
  }
  return ["none"];
}

export function formatAllowedNextActionsSummary(row: ApproachResultNextRules): string {
  const allowed = resolveAllowedNextActions(row);
  if (allowed.length === 0) return "—";
  return allowed.map((k) => APPROACH_NEXT_ACTION_LABELS[k]).join(", ");
}

export function validateNextActionChoice(
  row: ApproachResultNextRules,
  nextType: ApproachNextActionKey
): string | null {
  const allowed = resolveAllowedNextActions(row);
  if (!allowed.includes(nextType)) {
    return "Próximo passo não permitido para este resultado comercial.";
  }
  if (row.require_schedule_return && nextType !== "schedule_return") {
    return "Este resultado exige agendar retorno com data e hora.";
  }
  if (row.requires_meeting && nextType !== "schedule_meeting") {
    return "Este resultado exige agendar reunião com data e hora.";
  }
  if (requiresNonNoneNextStep(row) && nextType === "none") {
    return "Este resultado exige definir um próximo passo além de Nenhum.";
  }
  if (!allowed.includes("none") && nextType === "none") {
    return "Selecione um próximo passo para este resultado.";
  }
  return null;
}

export function defaultNextTypeForResult(row: ApproachResultNextRules): ApproachNextActionKey {
  const allowed = resolveAllowedNextActions(row);
  if (row.requires_meeting) return "schedule_meeting";
  if (row.require_schedule_return) return "schedule_return";
  if (allowed.includes("none")) return "none";
  return allowed[0] ?? "none";
}

export function serializeAllowedNextActions(keys: ApproachNextActionKey[]): string {
  const ordered = APPROACH_NEXT_ACTION_KEYS.filter((k) => keys.includes(k));
  return JSON.stringify(ordered);
}
