import type { CityPair } from "@/lib/lead-generation/city-resolve";
import { resolveCityPairs } from "@/lib/lead-generation/city-resolve";
import type { LeadGenFilters } from "@/lib/lead-generation/types";
import type { FlowInitialSource } from "@/lib/lead-generation/flow-modules";

/** Cidades para carga ANP revendedores (mapa oficial). */
export function resolveAnpRetailCityPairs(uf: string, filters: LeadGenFilters): CityPair[] {
  return resolveCityPairs(uf, filters);
}

/** Cidades para fluxos que não dependem do mapa ANP (Google / distribuidoras). */
export function resolveDiscoveryCityPairs(uf: string, filters: LeadGenFilters): CityPair[] {
  const anp = resolveCityPairs(uf, filters);
  if (anp.length > 0) return anp;
  const fromMuni =
    filters.municipalities?.map((m) => ({
      official: m.name.trim(),
      api: m.name.trim()
    })) ?? [];
  if (fromMuni.length > 0) return fromMuni;
  return (filters.cities ?? []).map((c) => ({ official: c, api: c }));
}

export function cityPairsForInitialSource(
  initialSource: FlowInitialSource,
  uf: string,
  filters: LeadGenFilters
): CityPair[] {
  if (initialSource === "anp_retail") return resolveAnpRetailCityPairs(uf, filters);
  return resolveDiscoveryCityPairs(uf, filters);
}
