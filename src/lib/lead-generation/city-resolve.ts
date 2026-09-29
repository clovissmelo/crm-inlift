import {
  ANP_CITIES_BY_UF,
  listOfficialCitiesForUf,
  resolveAnpMunicipioApiName
} from "@/lib/lead-motor/anp-cities";
import { citiesForRegionIds } from "@/lib/lead-motor/anp-regions";
import { BRAZIL_UFS } from "@/lib/lead-motor/brazil-ufs";
import { resolveAnpPairForMunicipality } from "@/lib/lead-generation/city-resolve-ibge";
import type { LeadGenFilters } from "@/lib/lead-generation/types";

export type CityPair = { official: string; api: string };

/** UFs com mapa de municípios ANP no motor. */
export function motorMappedUfs(): string[] {
  return Object.keys(ANP_CITIES_BY_UF).sort();
}

/** Todas as UFs do Brasil (para seleção na UI). */
export function allBrazilianUfCodes(): string[] {
  return BRAZIL_UFS.map((x) => x.code);
}

/** @deprecated use motorMappedUfs */
export function supportedUfs(): string[] {
  return motorMappedUfs();
}

export function ufHasMotorMapping(uf: string): boolean {
  return Boolean(ANP_CITIES_BY_UF[uf.toUpperCase()]);
}

export function normalizeLeadGenFilters(uf: string, filters: LeadGenFilters): LeadGenFilters {
  const u = uf.toUpperCase();
  const regionCities = citiesForRegionIds(u, filters.regions ?? []);
  const merged = new Set<string>([...filters.cities, ...regionCities]);
  return {
    ...filters,
    regions: filters.regions ?? [],
    cities: [...merged]
  };
}

export function resolveCityPairs(uf: string, filters: LeadGenFilters): CityPair[] {
  const u = uf.toUpperCase();
  const map = ANP_CITIES_BY_UF[u];

  if (filters.municipalities && filters.municipalities.length > 0) {
    const pairs: CityPair[] = [];
    const seen = new Set<string>();
    for (const m of filters.municipalities) {
      const pair = resolveAnpPairForMunicipality(u, { ibge_code: m.ibge_code, name: m.name });
      if (!pair || seen.has(pair.api)) continue;
      seen.add(pair.api);
      pairs.push(pair);
    }
    return pairs;
  }

  if (!map) return [];

  const normalized = normalizeLeadGenFilters(u, filters);

  if (normalized.all_cities_in_uf) {
    return Object.entries(map).map(([official, api]) => ({ official, api }));
  }

  const pairs: CityPair[] = [];
  const seen = new Set<string>();
  for (const raw of normalized.cities) {
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
