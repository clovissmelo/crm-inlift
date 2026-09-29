import type { FlowSnapshot } from "@/lib/lead-generation/flows-repo";
import type { FlowStepKey } from "@/lib/lead-generation/flow-modules";
import { isFlowStepKey } from "@/lib/lead-generation/flow-modules";

export type StepRunResult = {
  step_key: FlowStepKey;
  status: "ok" | "skipped" | "na" | "error";
  message?: string;
};

export function enabledItemSteps(snapshot: FlowSnapshot | null): FlowStepKey[] {
  if (!snapshot) {
    return [
      "validate_cnpj",
      "google_place_search",
      "google_place_details",
      "receita_cnpj",
      "website_enrich",
      "instagram_enrich",
      "create_crm_client"
    ];
  }
  return snapshot.steps
    .filter((s) => s.enabled && s.step_key !== "anp_retail_list" && s.step_key !== "anp_distributor_list" && s.step_key !== "google_places_city_discover")
    .map((s) => s.step_key)
    .filter(isFlowStepKey);
}

export function stepEnabled(snapshot: FlowSnapshot | null, key: FlowStepKey): boolean {
  if (!snapshot) return true;
  const row = snapshot.steps.find((s) => s.step_key === key);
  return row ? row.enabled : false;
}

export function onFailPolicy(snapshot: FlowSnapshot | null, key: FlowStepKey): "continue" | "stop" {
  const row = snapshot?.steps.find((s) => s.step_key === key);
  return row?.on_fail === "stop" ? "stop" : "continue";
}

export function appendStepLog(
  existing: Record<string, unknown> | null | undefined,
  results: StepRunResult[]
): Record<string, unknown> {
  const prev = (existing?.flow_steps as StepRunResult[] | undefined) ?? [];
  return { ...(existing ?? {}), flow_steps: [...prev, ...results], flow_sources: collectSources(results) };
}

function collectSources(results: StepRunResult[]): string[] {
  return results.filter((r) => r.status === "ok").map((r) => r.step_key);
}
