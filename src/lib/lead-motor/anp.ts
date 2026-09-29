import {
  ANP_429_BACKOFF_MS,
  ANP_API_BASE,
  ANP_CITY_SLEEP_MS,
  REQUEST_TIMEOUT_MS,
  WHITE_FLAG_DISTRIBUTORS,
} from "@/lib/lead-motor/motor-config";
import {
  type LeadGenSegmentFilter,
  stationMatchesSegment
} from "@/lib/lead-motor/lead-gen-segments";
import { isValidCnpjDigits, parseAddressNumber, safeStr } from "@/lib/lead-motor/utils";
import { normalizeCnpj } from "@/lib/format";

export type AnpStation = {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  bandeira: string;
  bandeira_branca: boolean;
  endereco: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  autorizacao_anp: string;
  situacao_anp: string;
  distribuidora: string;
  produtos_anp: string;
  latitude: string;
  longitude: string;
  /** Classificação heurística a partir dos dados ANP (revendedores combustível). */
  anp_segment: "retail" | "distributor" | "trr";
};

export async function fetchAnpMunicipalityPage(
  apiCity: string,
  uf: string,
  page: number
): Promise<{ data: Record<string, unknown>[]; totalPages: number }> {
  const params = new URLSearchParams({
    uf: uf.toUpperCase(),
    municipio: apiCity,
    numeropagina: String(page)
  });
  const url = `${ANP_API_BASE}?${params}`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "InliftCRM/1.0" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (res.status === 429) {
        await sleep(ANP_429_BACKOFF_MS * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`ANP HTTP ${res.status}`);
      const payload = (await res.json()) as {
        data?: Record<string, unknown>[];
        searchPageFilter?: { totalPagina?: number };
      };
      const totalPages = Number(payload.searchPageFilter?.totalPagina ?? 1);
      return { data: payload.data ?? [], totalPages: Math.max(1, totalPages) };
    } catch (e) {
      lastErr = e;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Falha na API ANP");
}

export async function fetchAnpMunicipality(apiCity: string, uf: string): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const batch = await fetchAnpMunicipalityPage(apiCity, uf, page);
    all.push(...batch.data);
    totalPages = batch.totalPages;
    page += 1;
  }
  return all;
}

export function mapAnpRecord(raw: Record<string, unknown>, officialCity: string, uf: string): AnpStation | null {
  const cnpj = normalizeCnpj(safeStr(raw.cnpj));
  if (!cnpj || !isValidCnpjDigits(cnpj)) return null;
  const endereco = safeStr(raw.endereco);
  const { logradouro, numero } = parseAddressNumber(endereco);
  const distribuidora = safeStr(raw.distribuidora).toUpperCase();
  const produtos = raw.produtos;
  let produtosTxt = "";
  if (Array.isArray(produtos)) {
    produtosTxt = produtos
      .filter((p): p is Record<string, unknown> => p != null && typeof p === "object")
      .map((p) => `${safeStr(p.produto)} (${safeStr(p.qtdeBicos)} bicos)`)
      .join("; ");
  }
  const razao = safeStr(raw.razaoSocial);
  const razaoUp = razao.toUpperCase();
  let anp_segment: AnpStation["anp_segment"] = "retail";
  if (/\bTRR\b/.test(razaoUp) || /TRANSPORTADOR\s+REVENDEDOR\s+RETALHISTA/i.test(razao)) {
    anp_segment = "trr";
  } else if (/\bDISTRIBUIDOR(A)?\b/.test(razaoUp)) {
    anp_segment = "distributor";
  }

  return {
    cnpj,
    razao_social: razao,
    nome_fantasia: "",
    bandeira: distribuidora || "SEM BANDEIRA",
    bandeira_branca: WHITE_FLAG_DISTRIBUTORS.has(distribuidora),
    endereco: endereco || logradouro,
    logradouro,
    numero,
    bairro: safeStr(raw.bairro),
    cidade: officialCity,
    uf: safeStr(raw.uf) || uf.toUpperCase(),
    cep: safeStr(raw.cep),
    autorizacao_anp: safeStr(raw.autorizacao),
    situacao_anp: safeStr(raw.situacaoConstatada),
    distribuidora,
    produtos_anp: produtosTxt,
    latitude: safeStr(raw.latitude),
    longitude: safeStr(raw.longitude),
    anp_segment
  };
}

export function filterStations(
  stations: AnpStation[],
  opts: {
    city?: string | null;
    segment: LeadGenSegmentFilter;
    limit: number;
  }
): AnpStation[] {
  let list = [...stations];
  if (opts.city) list = list.filter((s) => s.cidade === opts.city);
  list = list.filter((s) => stationMatchesSegment(s, opts.segment));
  list.sort((a, b) => a.cidade.localeCompare(b.cidade, "pt-BR") || a.razao_social.localeCompare(b.razao_social, "pt-BR"));
  if (opts.limit > 0) list = list.slice(0, opts.limit);
  return list;
}

export async function loadAnpForCities(
  uf: string,
  cityPairs: Array<{ official: string; api: string }>,
  onCityDone?: (official: string, count: number) => void
): Promise<AnpStation[]> {
  const out: AnpStation[] = [];
  for (const { official, api } of cityPairs) {
    const rawRows = await fetchAnpMunicipality(api, uf);
    for (const row of rawRows) {
      const mapped = mapAnpRecord(row, official, uf);
      if (mapped) out.push(mapped);
    }
    onCityDone?.(official, rawRows.length);
    await sleep(ANP_CITY_SLEEP_MS);
  }
  return out;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
