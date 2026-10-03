import type { ProspeccaoPriorityTypeRow } from "@/lib/call-strategy/priorities-config";
import { PROSPECCAO_RULE_KIND_LABELS } from "@/lib/prospeccao-priority-queue-admin";

/** Texto da legenda: descrição do cadastro ou explicação padrão da regra. */
export function prospeccaoPriorityLegendText(
  row: Pick<ProspeccaoPriorityTypeRow, "description" | "rule_kind" | "slug" | "name">
): string {
  const fromCadastro = row.description?.trim();
  if (fromCadastro) return fromCadastro;

  if (
    row.slug === "retorno" ||
    row.rule_kind === "return_due" ||
    row.rule_kind === "scheduled_return"
  ) {
    return "Cliente com retorno agendado manualmente no atendimento; entra na fila na data e hora marcadas e fica por último até vencer.";
  }

  if (row.rule_kind === "overdue_return") {
    return "Retorno já passou do horário agendado; sobe na fila com destaque (!) até ser atendido.";
  }

  const fromRule = PROSPECCAO_RULE_KIND_LABELS[row.rule_kind];
  if (fromRule) return fromRule;

  return row.name;
}

export type ProspeccaoPriorityLegendItem = Pick<
  ProspeccaoPriorityTypeRow,
  "id" | "slug" | "name" | "color" | "description" | "rule_kind" | "queue_anchor" | "sort_order"
>;
