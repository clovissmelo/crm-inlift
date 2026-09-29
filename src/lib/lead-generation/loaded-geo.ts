import { all } from "@/lib/db";
import { listRegionsForUf } from "@/lib/lead-motor/anp-regions";
import { listOfficialCitiesForUf } from "@/lib/lead-motor/anp-cities";
import type { LeadGenFilters } from "@/lib/lead-generation/types";
import { normalizeSegmentFilter } from "@/lib/lead-motor/lead-gen-segments";
import { normalizeLeadGenFilters } from "@/lib/lead-generation/city-resolve";

type RawRun = { uf: string; status: string; filters_json: unknown };

function parseFiltersJson(raw: unknown): LeadGenFilters {
  const base: LeadGenFilters = { cities: [], regions: [], all_cities_in_uf: false, segment: "all" };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.cities)) base.cities = o.cities.map(String);
  if (Array.isArray(o.regions)) base.regions = o.regions.map(String);
  if (typeof o.all_cities_in_uf === "boolean") base.all_cities_in_uf = o.all_cities_in_uf;
  if (typeof o.segment === "string") base.segment = normalizeSegmentFilter(o.segment);
  return base;
}

/** Execuções que de fato iniciaram (ou concluíram) carga ANP — exclui canceladas antes de uso. */
const LOADED_STATUSES = new Set(["queued", "running", "paused", "completed", "failed"]);

export async function getLoadedGeoForUf(uf: string): Promise<{ cities: Set<string>; regions: Set<string> }> {
  const u = uf.toUpperCase();
  const rows = await all<RawRun>(
    `
      SELECT uf, status, filters_json
      FROM lead_generation_runs
      WHERE uf = @uf
      ORDER BY id DESC
      LIMIT 500
    `,
    { uf: u }
  );

  const cities = new Set<string>();
  const regions = new Set<string>();

  for (const row of rows) {
    if (!LOADED_STATUSES.has(row.status)) continue;
    const parsed = parseFiltersJson(row.filters_json);
    if (parsed.all_cities_in_uf) {
      for (const c of listOfficialCitiesForUf(u)) cities.add(c);
      continue;
    }
    for (const id of parsed.regions ?? []) regions.add(id);
    const filters = normalizeLeadGenFilters(u, parsed);
    for (const c of filters.cities) cities.add(c);
  }

  for (const reg of listRegionsForUf(u)) {
    if (regions.has(reg.id)) continue;
    if (reg.cities.length > 0 && reg.cities.every((c) => cities.has(c))) regions.add(reg.id);
  }

  return { cities, regions };
}
