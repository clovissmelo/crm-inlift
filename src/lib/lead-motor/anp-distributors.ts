/**
 * Distribuidoras de combustíveis — base ANP (parser dedicado, não reutiliza revendedores).
 * Fonte configurável via env ANP_DISTRIBUTORS_DATA_URL (CSV dados abertos).
 */

import { REQUEST_TIMEOUT_MS } from "@/lib/lead-motor/motor-config";
import { isValidCnpjDigits, safeStr } from "@/lib/lead-motor/utils";
import { normalizeCnpj } from "@/lib/format";
import type { AnpStation } from "@/lib/lead-motor/anp";

export type AnpDistributorRecord = {
  cnpj: string;
  razao_social: string;
  uf: string;
  cidade: string;
  endereco: string;
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === ";" && !inQ) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** Converte registro de distribuidora para formato compatível com o motor (AnpStation). */
export function distributorToStation(rec: AnpDistributorRecord): AnpStation {
  return {
    cnpj: rec.cnpj,
    razao_social: rec.razao_social,
    nome_fantasia: rec.razao_social,
    bandeira: "",
    bandeira_branca: false,
    endereco: rec.endereco,
    logradouro: rec.endereco,
    numero: "",
    bairro: "",
    cidade: rec.cidade,
    uf: rec.uf,
    cep: "",
    autorizacao_anp: "",
    situacao_anp: "ATIVO",
    distribuidora: rec.razao_social,
    produtos_anp: "",
    latitude: "",
    longitude: "",
    anp_segment: "distributor"
  };
}

export async function fetchAnpDistributorsForUf(uf: string): Promise<{
  records: AnpDistributorRecord[];
  source: "url" | "none";
  warning: string | null;
}> {
  const url = process.env.ANP_DISTRIBUTORS_DATA_URL?.trim();
  if (!url) {
    return {
      records: [],
      source: "none",
      warning:
        "Configure ANP_DISTRIBUTORS_DATA_URL (CSV dados abertos ANP) para carregar distribuidoras. Etapa registrada como indisponível."
    };
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return { records: [], source: "url", warning: "CSV vazio ou inválido." };
    const header = parseCsvLine(lines[0]!).map((h) => h.toLowerCase());
    const idxCnpj = header.findIndex((h) => h.includes("cnpj"));
    const idxNome = header.findIndex((h) => h.includes("raz") || h.includes("nome"));
    const idxUf = header.findIndex((h) => h === "uf" || h.includes("estado"));
    const idxCity = header.findIndex((h) => h.includes("municip") || h.includes("cidade"));
    const idxAddr = header.findIndex((h) => h.includes("endere"));
    const u = uf.toUpperCase();
    const records: AnpDistributorRecord[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]!);
      const cnpj = normalizeCnpj(cols[idxCnpj] ?? "") ?? "";
      if (!isValidCnpjDigits(cnpj)) continue;
      const rowUf = safeStr(cols[idxUf] ?? u).toUpperCase().slice(0, 2);
      if (rowUf !== u) continue;
      records.push({
        cnpj,
        razao_social: safeStr(cols[idxNome] ?? "Distribuidora"),
        uf: rowUf,
        cidade: safeStr(cols[idxCity] ?? ""),
        endereco: safeStr(cols[idxAddr] ?? "")
      });
    }
    return { records, source: "url", warning: records.length === 0 ? "Nenhuma distribuidora no CSV para esta UF." : null };
  } catch (e) {
    return {
      records: [],
      source: "url",
      warning: e instanceof Error ? e.message : "Falha ao baixar CSV de distribuidoras"
    };
  }
}
