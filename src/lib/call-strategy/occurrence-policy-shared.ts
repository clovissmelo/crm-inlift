/** Tipos e formatação usados no client — sem dependências de servidor. */

export type OccurrenceKind =
  | "no_answer"
  | "invalid"
  | "wrong_number"
  | "technical_fail"
  | "conversation_success";

export type DialOccurrencePolicy = {
  counts: boolean;
  kind: OccurrenceKind | null;
  limit: number;
  minIntervalMinutes: number;
  limitAction: "exhaust_phone" | "flag_review";
  associationId: number | null;
};

export const OCCURRENCE_KIND_LABELS: Record<OccurrenceKind, string> = {
  no_answer: "Não atendeu",
  invalid: "Número inválido",
  wrong_number: "Número errado",
  technical_fail: "Falha técnica",
  conversation_success: "Conversa válida"
};

export function formatOccurrenceSummary(row: {
  dial_counts_for_exhaustion: boolean;
  dial_occurrence_kind: string | null;
  dial_occurrence_limit: number | null;
  dial_min_interval_minutes: number | null;
}): string {
  if (!row.dial_counts_for_exhaustion) return "Não contabiliza";
  const limit = row.dial_occurrence_limit ?? 3;
  const intervalMin = row.dial_min_interval_minutes ?? 60;
  const intervalLabel =
    intervalMin >= 60 && intervalMin % 60 === 0 ? `${intervalMin / 60}h` : `${intervalMin}min`;
  return `${limit} ocorrências · intervalo ${intervalLabel}`;
}

export function formatCounterLine(kind: OccurrenceKind, count: number, limit: number): string {
  return `${OCCURRENCE_KIND_LABELS[kind]}: ${count} de ${limit}`;
}
