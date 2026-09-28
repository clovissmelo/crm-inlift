import {
  ANP_CITIES_BY_UF,
  listOfficialCitiesForUf,
  resolveAnpMunicipioApiName
} from "@/lib/lead-motor/anp-cities";

export type CityPair = { official: string; api: string };

export function supportedUfs(): string[] {
  return Object.keys(ANP_CITIES_BY_UF).sort();
}

export function resolveCityPairs(uf: string, filters: { cities: string[]; all_cities_in_uf: boolean }): CityPair[] {
  const u = uf.toUpperCase();
  const map = ANP_CITIES_BY_UF[u];
  if (!map) return [];

  if (filters.all_cities_in_uf) {
    return Object.entries(map).map(([official, api]) => ({ official, api }));
  }

  const pairs: CityPair[] = [];
  const seen = new Set<string>();
  for (const raw of filters.cities) {
    const name = raw.trim();
    if (!name) continue;
    const api = resolveAnpMunicipioApiName(u, name);
    if (!api) continue;
    const official =
      Object.entries(map).find(([, a]) => a === api)?.[0] ??
      Object.keys(map).find((k) => k.toLowerCase() === name.toLowerCase()) ??
      name;
    const key = api;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ official, api });
  }
  return pairs;
}

export function listCitiesForUf(uf: string): string[] {
  return listOfficialCitiesForUf(uf);
}
