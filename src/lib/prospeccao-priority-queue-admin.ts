import type { ProspeccaoPriorityTypeRow } from "@/lib/call-strategy/priorities-config";

export const PROSPECCAO_RULE_KIND_LABELS: Record<string, string> = {
  first_contact: "Primeiro contato (sem nenhuma ligação)",
  dial_round_tier: "Rodada de ligação (percorreu todos os números)",
  overdue_return: "Retorno atrasado (complemento ! na fila)",
  return_due: "Retorno vencido na fila",
  scheduled_return: "Retorno agendado (legado)",
  has_approach: "Já houve abordagem",
  no_phone: "Sem telefone válido"
};

export const CREATABLE_RULE_KINDS = [
  "dial_round_tier",
  "overdue_return",
  "has_approach",
  "no_phone"
] as const;

export type CreatableRuleKind = (typeof CREATABLE_RULE_KINDS)[number];

export function parseRuleParams(raw: string | null | undefined): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}

export function serializeRuleParams(params: Record<string, unknown>): string | null {
  if (!params || Object.keys(params).length === 0) return null;
  return JSON.stringify(params);
}

export function slugifyPriorityName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

export function sortPrioritiesForDisplay(rows: ProspeccaoPriorityTypeRow[]): ProspeccaoPriorityTypeRow[] {
  const start = rows.filter((r) => r.queue_anchor === "start");
  const end = rows.filter((r) => r.queue_anchor === "end");
  const middle = rows.filter((r) => r.queue_anchor !== "start" && r.queue_anchor !== "end");
  middle.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  start.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  end.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  return [...start, ...middle, ...end];
}

/** Primeiro contato = 1; meio = 10,20,…; retorno = 100000 */
export function normalizePrioritySortOrders(rows: ProspeccaoPriorityTypeRow[]): ProspeccaoPriorityTypeRow[] {
  const sorted = sortPrioritiesForDisplay(rows);
  let mid = 10;
  return sorted.map((r) => {
    if (r.queue_anchor === "start") return { ...r, sort_order: 1 };
    if (r.queue_anchor === "end") return { ...r, sort_order: 100_000 };
    const next = { ...r, sort_order: mid };
    mid += 10;
    return next;
  });
}

export function ruleKindSummary(row: ProspeccaoPriorityTypeRow): string {
  const params = parseRuleParams(row.rule_params);
  if (row.rule_kind === "dial_round_tier") {
    const round = params.round;
    return typeof round === "number" ? `Rodada ${round} (ligação ${round})` : "Rodada de ligação";
  }
  return PROSPECCAO_RULE_KIND_LABELS[row.rule_kind] ?? row.rule_kind;
}

export function canDeletePriority(row: ProspeccaoPriorityTypeRow): boolean {
  return row.queue_anchor === "none" && row.is_system !== true;
}

export function isFixedQueueAnchor(row: ProspeccaoPriorityTypeRow): boolean {
  return row.queue_anchor === "start" || row.queue_anchor === "end";
}

export function effectiveSortOrderForPatch(
  row: ProspeccaoPriorityTypeRow,
  requested: number | undefined
): number {
  if (row.queue_anchor === "start") return 1;
  if (row.queue_anchor === "end") return 100_000;
  return requested ?? row.sort_order;
}
