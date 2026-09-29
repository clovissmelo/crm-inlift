import { resolveAnpMunicipioApiName } from "@/lib/lead-motor/anp-cities";
import { ANP_CITIES_BY_UF } from "@/lib/lead-motor/anp-cities";
import type { IbgeMunicipality } from "@/lib/lead-generation/ibge-localidades";
import type { CityPair } from "@/lib/lead-generation/city-resolve";

export type SelectedMunicipality = {
  ibge_code: number;
  name: string;
  commercial_zone_id?: number | null;
};

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
    if (m.ibge_code <= 0) {
      skipped.push(m);
      continue;
    }
    const pair = resolveAnpPairForMunicipality(uf, m);
    if (!pair) {
      skipped.push(m);
      continue;
    }
    if (seen.has(pair.api)) continue;
    seen.add(pair.api);
    pairs.push(pair);
    municipalities.push(m);
  }
  return { pairs, municipalities, skipped };
}

export function municipalityAnpSupported(uf: string, m: IbgeMunicipality): boolean {
  const u = uf.toUpperCase();
  if (!ANP_CITIES_BY_UF[u]) return true;
  return resolveAnpMunicipioApiName(u, m.name) != null;
}
