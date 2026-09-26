/** Ordem fixa na lista e no filtro de prioridade */
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
