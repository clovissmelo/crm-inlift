import { cityPairsForInitialSource } from "@/lib/lead-generation/discovery-cities";
import { resolveCityPairsFromMunicipalities } from "@/lib/lead-generation/city-resolve-ibge";
import type { FlowInitialSource } from "@/lib/lead-generation/flow-modules";
import { getUfGeoFromIbge } from "@/lib/lead-generation/ibge-localidades";
import { getLeadGenerationRun, updateRun } from "@/lib/lead-generation/runs-repo";
import type { LeadGenFilters, LeadGenMunicipalityRef } from "@/lib/lead-generation/types";
import { computeRunProgressPct } from "@/lib/lead-generation/run-progress";

function runInitialSource(runRow: NonNullable<Awaited<ReturnType<typeof getLeadGenerationRun>>>): FlowInitialSource {
  return runRow.flow_snapshot_json?.initial_source ?? "anp_retail";
}

/** Amplia municípios da execução para tentar atingir a meta de novos. */
export async function tryExpandRunGeography(runId: number): Promise<boolean> {
  const runRow = await getLeadGenerationRun(runId);
  if (!runRow) return false;
  const filters = runRow.filters_json;
  if (filters.all_cities_in_uf) return false;

  const counts = { ...runRow.counts_json };
  const level = counts.geo_expansion_level ?? 0;
  if (level >= 2) return false;
  if ((counts.created ?? 0) >= runRow.max_stations) return false;

  const ibge = await getUfGeoFromIbge(runRow.uf);
  const existingCodes = new Set((filters.municipalities ?? []).map((m) => m.ibge_code));
  const toAdd: LeadGenMunicipalityRef[] = [];

  if (level === 0) {
    const regionIds = new Set(
      (filters.municipalities ?? [])
        .map((m) => m.ibge_immediate_region_id)
        .filter((id): id is number => id != null && id > 0)
    );
    if (regionIds.size === 0 && (filters.municipalities?.length ?? 0) === 1) {
      const only = filters.municipalities![0]!;
      const m = ibge.municipalities.find((x) => x.ibge_code === only.ibge_code);
      if (m?.immediate_region_id) regionIds.add(m.immediate_region_id);
    }
    for (const m of ibge.municipalities) {
      if (!m.immediate_region_id || !regionIds.has(m.immediate_region_id)) continue;
      if (existingCodes.has(m.ibge_code)) continue;
      toAdd.push({
        ibge_code: m.ibge_code,
        name: m.name,
        commercial_zone_id: null,
        ibge_immediate_region_id: m.immediate_region_id,
        ibge_immediate_region_name: m.immediate_region_name
      });
      existingCodes.add(m.ibge_code);
    }
  } else {
    for (const m of ibge.municipalities) {
      if (existingCodes.has(m.ibge_code)) continue;
      toAdd.push({
        ibge_code: m.ibge_code,
        name: m.name,
        commercial_zone_id: null,
        ibge_immediate_region_id: m.immediate_region_id,
        ibge_immediate_region_name: m.immediate_region_name
      });
      existingCodes.add(m.ibge_code);
    }
  }

  if (toAdd.length === 0) return false;

  const mergedMunicipalities = [...(filters.municipalities ?? []), ...toAdd];
  const { pairs } = resolveCityPairsFromMunicipalities(
    runRow.uf,
    mergedMunicipalities,
    ibge.municipalities,
    false
  );
  if (pairs.length <= (counts.cities_total ?? 0)) return false;

  const nextFilters: LeadGenFilters = {
    ...filters,
    municipalities: mergedMunicipalities,
    cities: pairs.map((p) => p.official)
  };

  const src = runInitialSource(runRow);
  const allPairs = cityPairsForInitialSource(src, runRow.uf, nextFilters);
  counts.geo_expansion_level = level + 1;
  counts.cities_total = allPairs.length;
  counts.geo_expanded = true;

  await updateRun(runId, {
    filters_json: nextFilters,
    phase: "anp_load",
    counts_json: counts,
    progress_pct: computeRunProgressPct({
      phase: "anp_load",
      status: runRow.status,
      max_stations: runRow.max_stations,
      counts_json: counts
    }),
    error_message: null
  });
  return true;
}

export function isGeoExpansionExhausted(counts: { geo_expansion_level?: number }, allCitiesInUf: boolean): boolean {
  if (allCitiesInUf) return true;
  return (counts.geo_expansion_level ?? 0) >= 2;
}
