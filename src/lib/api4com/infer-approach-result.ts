/** Três primeiros resultados comerciais (ordem padrão), inferíveis pela telefonia. */
export type AutoApproachResultSlug = "nao_atendeu" | "chamou_sem_resposta" | "numero_invalido";

export const AUTO_APPROACH_RESULT_SLUGS: AutoApproachResultSlug[] = [
  "nao_atendeu",
  "chamou_sem_resposta",
  "numero_invalido"
];

export type CallHangupSignals = {
  hangup_cause_code: string | null;
  hangup_cause_label: string | null;
  duration_seconds: number | null;
  answered_at: string | null;
};

function norm(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  return raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function haystack(input: CallHangupSignals): string {
  return [norm(input.hangup_cause_label), norm(input.hangup_cause_code)].filter(Boolean).join(" ");
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((n) => text.includes(n));
}

/**
 * Infere slug de resultado comercial a partir do hangup da API4COM / FreeSWITCH.
 * Retorna null se não houver correspondência confiável.
 */
export function inferApproachResultSlugFromCall(input: CallHangupSignals): AutoApproachResultSlug | null {
  const text = haystack(input);
  if (!text) return null;

  const answered = Boolean(input.answered_at?.trim());

  if (
    includesAny(text, [
      "NUMBER_CHANGED",
      "UNALLOCATED",
      "INVALID_NUMBER",
      "INVALID_NUMBER_FORMAT",
      "NO_ROUTE",
      "NOT_FOUND",
      "UNASSIGNED_NUMBER",
      "DESTINATION_OUT_OF_ORDER",
      "INVALID_GATEWAY"
    ]) ||
    input.hangup_cause_code === "484" ||
    input.hangup_cause_code === "404" ||
    input.hangup_cause_code === "604"
  ) {
    return "numero_invalido";
  }

  if (
    includesAny(text, [
      "NO_ANSWER",
      "NO_USER_RESPONSE",
      "SUBSCRIBER_ABSENT",
      "ALLOTTED_TIMEOUT",
      "RECOVERY_ON_TIMER"
    ]) ||
    input.hangup_cause_code === "18" ||
    input.hangup_cause_code === "19" ||
    input.hangup_cause_code === "480"
  ) {
    return "nao_atendeu";
  }

  if (
    !answered &&
    (includesAny(text, ["ORIGINATOR_CANCEL", "LOSE_RACE", "CALL_REJECTED", "REQUEST_TERMINATED"]) ||
      input.hangup_cause_code === "487" ||
      input.hangup_cause_code === "21")
  ) {
    return "chamou_sem_resposta";
  }

  return null;
}
