import type { ProspeccaoPriorityTypeRow } from "@/lib/call-strategy/priorities-config";
import { parseRuleParams, sortPrioritiesForDisplay } from "@/lib/prospeccao-priority-queue-admin";

/** Deslocamento na ordenação quando retorno está atrasado (sobe na fila, mantém o rótulo base). */
export const QUEUE_OVERDUE_SORT_BOOST = 5_000;

export type ClientQueueSignals = {
  hasApproach: boolean;
  hasPhones: boolean;
  hasAnyDialAttempt: boolean;
  completedDialRounds: number;
  pendingReturnAt: string | null;
  returnOverdue: boolean;
};

export type ResolvedQueuePriority = {
  slug: string;
  name: string;
  color: string;
  sortOrder: number;
  effectiveSortOrder: number;
  overdueAlert: boolean;
};

function matchesNonReturnType(type: ProspeccaoPriorityTypeRow, s: ClientQueueSignals): boolean {
  const params = parseRuleParams(type.rule_params);
  switch (type.rule_kind) {
    case "first_contact":
      return !s.hasAnyDialAttempt;
    case "dial_round_tier": {
      const round = params.round;
      if (typeof round !== "number" || !Number.isFinite(round)) return false;
      if (!s.hasAnyDialAttempt) return false;
      const currentLigacao = s.completedDialRounds + 1;
      return currentLigacao === round;
    }
    case "has_approach":
      return s.hasApproach;
    case "no_phone":
      return !s.hasPhones;
    case "overdue_return":
    case "return_due":
    case "scheduled_return":
      return false;
    default:
      return false;
  }
}

function findReturnType(types: ProspeccaoPriorityTypeRow[]): ProspeccaoPriorityTypeRow | undefined {
  return types.find(
    (t) =>
      t.queue_anchor === "end" ||
      t.rule_kind === "return_due" ||
      t.rule_kind === "scheduled_return" ||
      t.slug === "retorno"
  );
}

function findOverdueType(types: ProspeccaoPriorityTypeRow[]): ProspeccaoPriorityTypeRow | undefined {
  return types.find((t) => t.rule_kind === "overdue_return" || t.slug === "reagendar");
}

function toResolved(
  type: ProspeccaoPriorityTypeRow,
  overdueAlert: boolean
): ResolvedQueuePriority {
  const sortOrder = type.sort_order;
  const effectiveSortOrder = overdueAlert ? Math.max(1, sortOrder - QUEUE_OVERDUE_SORT_BOOST) : sortOrder;
  return {
    slug: type.slug,
    name: type.name,
    color: type.color,
    sortOrder,
    effectiveSortOrder,
    overdueAlert
  };
}

export function resolveQueuePriorityForClient(
  signals: ClientQueueSignals,
  types: ProspeccaoPriorityTypeRow[]
): ResolvedQueuePriority {
  const sorted = sortPrioritiesForDisplay(types);
  const fallback =
    sorted.find((t) => t.rule_kind === "first_contact" || t.slug === "primeiro_contato") ?? sorted[0];

  if (signals.pendingReturnAt) {
    if (signals.returnOverdue) {
      const overdue = findOverdueType(sorted);
      if (overdue) return toResolved(overdue, true);
    }
    const ret = findReturnType(sorted);
    if (ret) return toResolved(ret, signals.returnOverdue);
  }

  for (const type of sorted) {
    if (type.queue_anchor === "end") continue;
    if (matchesNonReturnType(type, signals)) return toResolved(type, false);
  }

  if (fallback) return toResolved(fallback, false);

  return {
    slug: "primeiro_contato",
    name: "Primeiro contato",
    color: "#64748b",
    sortOrder: 1,
    effectiveSortOrder: 1,
    overdueAlert: false
  };
}

export function compareResolvedQueuePriority(
  a: ResolvedQueuePriority,
  b: ResolvedQueuePriority,
  followUpA: string | null,
  followUpB: string | null
): number {
  if (a.effectiveSortOrder !== b.effectiveSortOrder) return a.effectiveSortOrder - b.effectiveSortOrder;
  const ta = followUpA ? new Date(followUpA).getTime() : Number.MAX_SAFE_INTEGER;
  const tb = followUpB ? new Date(followUpB).getTime() : Number.MAX_SAFE_INTEGER;
  if (ta !== tb) return ta - tb;
  return 0;
}
