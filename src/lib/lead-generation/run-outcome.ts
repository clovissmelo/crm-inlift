import type { LeadGenCounts } from "@/lib/lead-generation/types";

export function formatRunResultsSummary(counts: LeadGenCounts): string {
  const created = counts.created ?? 0;
  const existing = counts.existing ?? 0;
  const ambiguous = counts.ambiguous ?? 0;
  const errors = counts.errors ?? 0;
  const noGoogle = counts.no_google_match ?? 0;
  const invalid = counts.skipped_invalid_cnpj ?? 0;
  const parts = [`${created} novos`, `${existing} já no CRM`];
  if (noGoogle > 0) parts.push(`${noGoogle} sem Google`);
  if (invalid > 0) parts.push(`${invalid} CNPJ inválido`);
  if (ambiguous > 0) parts.push(`${ambiguous} revisão`);
  if (errors > 0) parts.push(`${errors} erro${errors === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

/** Texto explicativo quando a meta de novos não foi atingida. */
export function buildPartialRunLog(input: {
  target: number;
  counts: LeadGenCounts;
  geoExpanded: boolean;
  exhaustedGeo: boolean;
}): string {
  const { target, counts } = input;
  const created = counts.created ?? 0;
  const lines: string[] = [`Meta: ${created}/${target} novos cadastrados.`];
  lines.push(formatRunResultsSummary(counts));

  const existing = counts.existing ?? 0;
  const processed = counts.processed ?? 0;
  const itemsTotal = counts.items_total ?? 0;

  if (processed === 0 && itemsTotal === 0) {
    lines.push(
      "Nenhum posto foi enfileirado (ANP vazia, cidade/UF sem revenda no segmento ou mapa ANP desatualizado para a seleção)."
    );
  } else if (created === 0 && existing > 0 && existing >= processed - (counts.errors ?? 0)) {
    lines.push("Todos os postos analisados já estavam no CRM ou foram descartados antes de criar lead.");
  } else if ((counts.no_google_match ?? 0) > 0) {
    lines.push("Parte dos postos não teve correspondência válida no Google Places.");
  }
  if ((counts.skipped_invalid_cnpj ?? 0) > 0) {
    lines.push("Alguns registros foram ignorados por CNPJ inválido ou ausente na ANP.");
  }
  if (input.geoExpanded) {
    lines.push("A busca foi ampliada automaticamente para mais cidades da região/UF.");
  }
  if (input.exhaustedGeo && created < target) {
    lines.push("Não há mais cidades/postos elegíveis na área configurada para esta execução.");
  }
  if ((counts.errors ?? 0) > 0) {
    const errN = counts.errors ?? 0;
    if (created === 0 && errN >= processed && processed > 0) {
      lines.push(
        "Nenhum posto pôde ser processado: dados da fonte (ANP) ausentes ou ilegíveis nos itens enfileirados. " +
          "Confira a aba Erros, amplie cidades/UF ou inicie uma nova execução."
      );
    } else {
      lines.push("Verifique a aba Erros no detalhe da execução.");
    }
  }

  return lines.join(" ");
}

export function buildStuckRunError(input: {
  counts: LeadGenCounts;
  target: number;
  reason: "no_progress" | "no_success" | "timeout";
}): string {
  const summary = formatRunResultsSummary(input.counts);
  if (input.reason === "timeout") {
    return `Execução interrompida: ficou sem progresso por muito tempo. ${summary}`;
  }
  if (input.reason === "no_success") {
    return (
      `Execução interrompida: ${input.counts.processed ?? 0} postos analisados sem nenhum lead novo ` +
      `(meta ${input.target}). ${summary}. Revise segmento, Google Places ou amplie UF/cidades.`
    );
  }
  return `Execução interrompida: sem avanço repetido. ${summary}`;
}

/** Falha se muitas tentativas sem nenhum novo cadastro. */
export function shouldFailNoSuccess(counts: LeadGenCounts, target: number): boolean {
  const created = counts.created ?? 0;
  const processed = counts.processed ?? 0;
  if (created > 0) return false;
  if (target <= 0) return false;
  const threshold = Math.max(40, target * 12);
  return processed >= threshold;
}
