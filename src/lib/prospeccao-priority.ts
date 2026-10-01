import type { ProspeccaoPriorityTypeRow } from "@/lib/call-strategy/priorities-config";
import { sortPrioritiesForDisplay } from "@/lib/prospeccao-priority-queue-admin";

/** Opções de filtro alinhadas ao admin (slug → nome). */
export function buildProspeccaoPriorityFilterOptions(
  types: ProspeccaoPriorityTypeRow[]
): Array<{ slug: string; name: string }> {
  return sortPrioritiesForDisplay(types).map((t) => ({ slug: t.slug, name: t.name }));
}

/** @deprecated use slugs dinâmicos do admin */
export const PROSPECCAO_PRIORIDADE_FILTER_ORDER = [
  "reagendar",
  "retorno",
  "acompanhamento",
  "primeiro_contato"
] as const;

export type ProspeccaoPrioridadeFilter = (typeof PROSPECCAO_PRIORIDADE_FILTER_ORDER)[number];

export const PROSPECCAO_PRIORIDADE_LABELS: Record<ProspeccaoPrioridadeFilter, string> = {
  reagendar: "Reagendar",
  retorno: "Retorno",
  acompanhamento: "Acompanhamento",
  primeiro_contato: "Primeiro contato"
};

export type ProspeccaoPrioridadeLabel = (typeof PROSPECCAO_PRIORIDADE_LABELS)[ProspeccaoPrioridadeFilter];
