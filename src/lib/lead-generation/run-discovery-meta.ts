import { cityPairsForInitialSource } from "@/lib/lead-generation/discovery-cities";
import type { FlowInitialSource } from "@/lib/lead-generation/flow-modules";
import type { LeadGenCounts, LeadGenerationRunRow } from "@/lib/lead-generation/types";

export function runInitialSourceFromRow(
  runRow: Pick<LeadGenerationRunRow, "flow_snapshot_json">
): FlowInitialSource {
  return runRow.flow_snapshot_json?.initial_source ?? "anp_retail";
}

function discoveryPairs(
  runRow: Pick<LeadGenerationRunRow, "uf" | "filters_json" | "flow_snapshot_json">
) {
  return cityPairsForInitialSource(runInitialSourceFromRow(runRow), runRow.uf, runRow.filters_json);
}

/** Garante cities_total/cities_loaded coerentes quando o JSON da execução ficou incompleto. */
export function repairDiscoveryCounts(
  runRow: Pick<LeadGenerationRunRow, "uf" | "filters_json" | "flow_snapshot_json">,
  counts: LeadGenCounts
): LeadGenCounts {
  const next = { ...counts };
  const pairs = discoveryPairs(runRow);
  if ((next.cities_total ?? 0) <= 0 && pairs.length > 0) {
    next.cities_total = pairs.length;
  }
  return next;
}

/**
 * Postos já enfileirados ⇒ carga ANP considerada concluída (evita loop anp_load ↔ processing).
 */
export function syncDiscoveryCountsWhenItemsQueued(
  runRow: Pick<LeadGenerationRunRow, "uf" | "filters_json" | "flow_snapshot_json">,
  counts: LeadGenCounts,
  queuedItems: number
): LeadGenCounts {
  const items = Math.max(queuedItems, counts.items_total ?? 0);
  if (items <= 0) return repairDiscoveryCounts(runRow, counts);
  const pairs = discoveryPairs(runRow);
  if (pairs.length === 0) return repairDiscoveryCounts(runRow, counts);
  const next = repairDiscoveryCounts(runRow, counts);
  next.cities_total = pairs.length;
  if ((next.cities_loaded ?? 0) < pairs.length) {
    next.cities_loaded = pairs.length;
  }
  return next;
}
