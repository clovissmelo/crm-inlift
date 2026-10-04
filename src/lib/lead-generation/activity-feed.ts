import type { AnpStation } from "@/lib/lead-motor/anp";
import type { LeadGenCounts } from "@/lib/lead-generation/types";

const STATUS_PT: Record<string, string> = {
  created: "Novo lead",
  existing: "Já no CRM",
  ambiguous: "Revisão",
  error: "Erro",
  no_google_match: "Sem Google",
  skipped_invalid_cnpj: "CNPJ inválido",
  processing: "Processando"
};

function parseStationField(raw: unknown): AnpStation | null {
  if (!raw) return null;
  let value: unknown = raw;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      value = JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const name =
    String(o.nome_fantasia ?? "").trim() ||
    String(o.razao_social ?? "").trim() ||
    String(o.name ?? "").trim();
  if (!name && !o.cnpj) return null;
  return value as AnpStation;
}

export type LeadGenActivityEntry = {
  id: number;
  cnpj: string;
  status: string;
  label: string;
  detail: string | null;
  at: string;
};

/** Mais recente primeiro (inserções novas no topo do feed). */
export function sortActivityFeedDesc<T extends { id: number; at: string }>(lines: T[]): T[] {
  return [...lines].sort((a, b) => {
    const tb = Date.parse(b.at);
    const ta = Date.parse(a.at);
    if (Number.isFinite(tb) && Number.isFinite(ta) && tb !== ta) return tb - ta;
    return b.id - a.id;
  });
}

export function formatLeadGenActivityEntry(row: Record<string, unknown>): LeadGenActivityEntry {
  const station = parseStationField(row.station_json) ?? parseStationField(row.anp_raw);
  const cnpj = String(row.cnpj ?? "").replace(/^gplace:/, "");
  const status = String(row.status ?? "");
  const kind = STATUS_PT[status] ?? status;
  const placeName =
    station?.nome_fantasia?.trim() ||
    station?.razao_social?.trim() ||
    (station as { name?: string } | null)?.name?.trim() ||
    "";
  const city = station?.cidade?.trim() ?? "";
  const labelParts = [kind];
  if (placeName) labelParts.push(placeName);
  else if (cnpj && !cnpj.startsWith("gplace:")) labelParts.push(`CNPJ ${cnpj}`);
  const label = labelParts.join(" · ");
  const detail =
    row.error_message != null && String(row.error_message).trim()
      ? String(row.error_message)
      : city
        ? city
        : null;
  return {
    id: Number(row.id),
    cnpj,
    status,
    label,
    detail,
    at: String(row.updated_at ?? row.created_at ?? "")
  };
}

export function runPhaseActivityLine(input: {
  phase: string;
  uf: string;
  counts_json: LeadGenCounts | Record<string, number>;
}): string | null {
  const counts = input.counts_json ?? {};
  const lastCity = counts.last_anp_city ? String(counts.last_anp_city) : "";
  if (input.phase === "anp_load") {
    if (lastCity) return `Consultando ANP em ${lastCity} (${input.uf})…`;
    const total = counts.cities_total ?? 0;
    const loaded = counts.cities_loaded ?? 0;
    if (total > 0) return `Carregando postos ANP (${loaded}/${total} cidades)…`;
    return "Preparando consulta ANP…";
  }
  if (input.phase === "processing" && (counts.processed ?? 0) > 0) {
    return `Enriquecendo postos (${counts.processed ?? 0} analisados, ${counts.created ?? 0} novos)…`;
  }
  return null;
}
