import { cityPairsForInitialSource } from "@/lib/lead-generation/discovery-cities";
import type { FlowInitialSource } from "@/lib/lead-generation/flow-modules";
import type { LeadGenCounts, LeadGenerationRunRow } from "@/lib/lead-generation/types";

export function runInitialSourceFromRow(
  runRow: Pick<LeadGenerationRunRow, "flow_snapshot_json">
): FlowInitialSource {
  return runRow.flow_snapshot_json?.initial_source ?? "anp_retail";
}

/** Garante cities_total/cities_loaded coerentes quando o JSON da execução ficou incompleto. */
export function repairDiscoveryCounts(
  runRow: Pick<LeadGenerationRunRow, "uf" | "filters_json" | "flow_snapshot_json">,
  counts: LeadGenCounts
): LeadGenCounts {
  const next = { ...counts };
  const pairs = cityPairsForInitialSource(runInitialSourceFromRow(runRow), runRow.uf, runRow.filters_json);
  if ((next.cities_total ?? 0) <= 0 && pairs.length > 0) {
    next.cities_total = pairs.length;
  }
  return next;
}
