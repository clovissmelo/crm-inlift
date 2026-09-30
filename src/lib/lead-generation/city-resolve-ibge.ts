import { resolveAnpMunicipioApiName } from "@/lib/lead-motor/anp-cities";
import { ANP_CITIES_BY_UF } from "@/lib/lead-motor/anp-cities";
import type { IbgeMunicipality } from "@/lib/lead-generation/ibge-localidades";
import type { CityPair } from "@/lib/lead-generation/city-resolve";

export type SelectedMunicipality = {
  ibge_code: number;
  name: string;
  commercial_zone_id?: number | null;
  ibge_immediate_region_id?: number | null;
  ibge_immediate_region_name?: string | null;
};

function toSelectedMunicipality(m: IbgeMunicipality | SelectedMunicipality): SelectedMunicipality {
  if ("immediate_region_id" in m) {
    return {
      ibge_code: m.ibge_code,
      name: m.name,
      commercial_zone_id: null,
      ibge_immediate_region_id: m.immediate_region_id,
      ibge_immediate_region_name: m.immediate_region_name
    };
  }
  return {
    ibge_code: m.ibge_code,
    name: m.name,
    commercial_zone_id: m.commercial_zone_id ?? null,
    ibge_immediate_region_id: m.ibge_immediate_region_id ?? null,
    ibge_immediate_region_name: m.ibge_immediate_region_name ?? null
  };
}

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/** Nome IBGE → par oficial/api ANP quando existir mapa. */
export function resolveAnpPairForMunicipality(uf: string, m: IbgeMunicipality): CityPair | null {
  const u = uf.toUpperCase();
  const map = ANP_CITIES_BY_UF[u];
  const name = m.name.trim();
  if (map) {
    const api = resolveAnpMunicipioApiName(u, name);
    if (api) {
      const official =
        Object.entries(map).find(([, a]) => a === api)?.[0] ??
        Object.keys(map).find((k) => normalizeName(k) === normalizeName(name)) ??
        name;
      return { official, api };
    }
  }
  const apiGuess = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase();
  if (apiGuess.length >= 2) return { official: name, api: apiGuess };
  return null;
}

export function resolveCityPairsFromMunicipalities(
  uf: string,
  selected: SelectedMunicipality[],
  allInUf: IbgeMunicipality[],
  allCitiesInUf: boolean
): { pairs: CityPair[]; municipalities: SelectedMunicipality[]; skipped: SelectedMunicipality[] } {
  const pool = allCitiesInUf ? allInUf : selected;
  const pairs: CityPair[] = [];
  const municipalities: SelectedMunicipality[] = [];
  const skipped: SelectedMunicipality[] = [];
  const seen = new Set<string>();

  for (const m of pool) {
    const row = toSelectedMunicipality(m as IbgeMunicipality | SelectedMunicipality);
    if (row.ibge_code <= 0) {
      skipped.push(row);
      continue;
    }
    const pair = resolveAnpPairForMunicipality(
      uf,
      "immediate_region_id" in m
        ? (m as IbgeMunicipality)
        : {
            ibge_code: m.ibge_code,
            name: m.name,
            immediate_region_id: row.ibge_immediate_region_id ?? null,
            immediate_region_name: row.ibge_immediate_region_name ?? null
          }
    );
    if (!pair) {
      skipped.push(row);
      continue;
    }
    if (seen.has(pair.api)) continue;
    seen.add(pair.api);
    pairs.push(pair);
    municipalities.push(row);
  }
  return { pairs, municipalities, skipped };
}

export function municipalityAnpSupported(uf: string, m: IbgeMunicipality): boolean {
  const u = uf.toUpperCase();
  if (!ANP_CITIES_BY_UF[u]) return true;
  return resolveAnpMunicipioApiName(u, m.name) != null;
}
