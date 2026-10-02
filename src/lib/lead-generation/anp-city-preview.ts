import { cityPairsForInitialSource } from "@/lib/lead-generation/discovery-cities";
import type { LeadGenFilters } from "@/lib/lead-generation/types";
import { fetchAnpMunicipality, filterStations, mapAnpRecord } from "@/lib/lead-motor/anp";
import { ANP_CITY_SLEEP_MS } from "@/lib/lead-motor/motor-config";
import type { LeadGenSegmentFilter } from "@/lib/lead-motor/lead-gen-segments";
import { countExistingCnpjsInCrm } from "@/lib/lead-motor/persist-client";

export type AnpCityPreviewRow = {
  city: string;
  postos: number;
  error: string | null;
};

export type AnpCityPreviewResult = {
  cities: AnpCityPreviewRow[];
  total_postos: number;
  unique_cnpjs: number;
  existing_in_crm: number;
  new_estimated: number;
  cities_scanned: number;
  cities_total: number;
  truncated: boolean;
};

const MAX_CITIES = 40;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Consulta API ANP por município (sem gravar execução). */
export async function previewAnpPostosByCity(input: {
  uf: string;
  filters: LeadGenFilters;
  segmentFilter: LeadGenSegmentFilter;
}): Promise<AnpCityPreviewResult> {
  const pairs = cityPairsForInitialSource("anp_retail", input.uf, input.filters);
  const cities_total = pairs.length;
  const truncated = cities_total > MAX_CITIES;
  const slice = pairs.slice(0, MAX_CITIES);

  const cities: AnpCityPreviewRow[] = [];
  const allCnpjs = new Set<string>();

  for (let i = 0; i < slice.length; i++) {
    const pair = slice[i]!;
    if (i > 0) await sleep(ANP_CITY_SLEEP_MS);
    try {
      const rawRows = await fetchAnpMunicipality(pair.api, input.uf);
      const mapped = rawRows
        .map((row) => mapAnpRecord(row, pair.official, input.uf))
        .filter((m): m is NonNullable<typeof m> => m != null);
      const filtered = filterStations(mapped, {
        city: pair.official,
        segment: input.segmentFilter,
        limit: 0
      });
      for (const s of filtered) allCnpjs.add(s.cnpj);
      cities.push({ city: pair.official, postos: filtered.length, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha na ANP";
      cities.push({ city: pair.official, postos: 0, error: msg });
    }
  }

  const unique_cnpjs = allCnpjs.size;
  const existing_in_crm = await countExistingCnpjsInCrm([...allCnpjs]);
  const total_postos = cities.reduce((a, c) => a + c.postos, 0);

  return {
    cities,
    total_postos,
    unique_cnpjs,
    existing_in_crm,
    new_estimated: Math.max(0, unique_cnpjs - existing_in_crm),
    cities_scanned: slice.length,
    cities_total,
    truncated
  };
}
