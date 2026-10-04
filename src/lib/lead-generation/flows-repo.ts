import { all, get, run, nowIso } from "@/lib/db";
import { FLOW_STEP_CATALOG, isFlowStepKey, type FlowInitialSource, type FlowStepKey } from "@/lib/lead-generation/flow-modules";

export type FlowStepRow = {
  id: number;
  step_key: FlowStepKey;
  sort_order: number;
  enabled: boolean;
  on_fail: "continue" | "stop";
  max_api_calls: number | null;
  config_json: Record<string, unknown>;
};

export type LeadGenerationFlowRow = {
  id: number;
  slug: string;
  name: string;
  description: string;
  active: boolean;
  initial_source: FlowInitialSource;
  steps: FlowStepRow[];
};

export type FlowSnapshot = {
  flow_id: number;
  slug: string;
  name: string;
  initial_source: FlowInitialSource;
  captured_at: string;
  steps: Array<{
    step_key: FlowStepKey;
    sort_order: number;
    enabled: boolean;
    on_fail: "continue" | "stop";
    max_api_calls: number | null;
    config_json: Record<string, unknown>;
    label: string;
  }>;
};

function mapSteps(rows: Array<Record<string, unknown>>): FlowStepRow[] {
  return rows
    .filter((r) => isFlowStepKey(String(r.step_key)))
    .map((r) => ({
      id: Number(r.id),
      step_key: String(r.step_key) as FlowStepKey,
      sort_order: Number(r.sort_order),
      enabled: Boolean(r.enabled),
      on_fail: (r.on_fail === "stop" ? "stop" : "continue") as "continue" | "stop",
      max_api_calls: r.max_api_calls != null ? Number(r.max_api_calls) : null,
      config_json: (r.config_json as Record<string, unknown>) ?? {}
    }))
    .sort((a, b) => a.sort_order - b.sort_order);
}

export async function listLeadGenerationFlows(opts?: { activeOnly?: boolean }): Promise<LeadGenerationFlowRow[]> {
  const flows = await all<Record<string, unknown>>(
    `
      SELECT id, slug, name, description, active, initial_source
      FROM lead_generation_flows
      ${opts?.activeOnly ? "WHERE active = true" : ""}
      ORDER BY name ASC
    `
  );
  const out: LeadGenerationFlowRow[] = [];
  for (const f of flows) {
    const steps = await all<Record<string, unknown>>(
      "SELECT * FROM lead_generation_flow_steps WHERE flow_id = @id ORDER BY sort_order ASC",
      { id: Number(f.id) }
    );
    out.push({
      id: Number(f.id),
      slug: String(f.slug),
      name: String(f.name),
      description: String(f.description ?? ""),
      active: Boolean(f.active),
      initial_source: String(f.initial_source) as FlowInitialSource,
      steps: mapSteps(steps)
    });
  }
  return out;
}

export async function getLeadGenerationFlow(id: number): Promise<LeadGenerationFlowRow | null> {
  const f = await get<Record<string, unknown>>("SELECT * FROM lead_generation_flows WHERE id = @id", { id });
  if (!f) return null;
  const steps = await all<Record<string, unknown>>(
    "SELECT * FROM lead_generation_flow_steps WHERE flow_id = @id ORDER BY sort_order ASC",
    { id }
  );
  return {
    id: Number(f.id),
    slug: String(f.slug),
    name: String(f.name),
    description: String(f.description ?? ""),
    active: Boolean(f.active),
    initial_source: String(f.initial_source) as FlowInitialSource,
    steps: mapSteps(steps)
  };
}

export async function getDefaultFlowForSegment(slug: string): Promise<LeadGenerationFlowRow | null> {
  const row = await get<{ default_flow_id: number | null }>(
    "SELECT default_flow_id FROM lead_generation_segments WHERE slug = @slug LIMIT 1",
    { slug }
  );
  if (row?.default_flow_id) return getLeadGenerationFlow(Number(row.default_flow_id));
  const fallback = await get<{ id: number }>(
    "SELECT id FROM lead_generation_flows WHERE slug = 'fluxo_posto' LIMIT 1"
  );
  return fallback ? getLeadGenerationFlow(Number(fallback.id)) : null;
}

export function buildFlowSnapshot(flow: LeadGenerationFlowRow): FlowSnapshot {
  return {
    flow_id: flow.id,
    slug: flow.slug,
    name: flow.name,
    initial_source: flow.initial_source,
    captured_at: nowIso(),
    steps: flow.steps.map((s) => ({
      step_key: s.step_key,
      sort_order: s.sort_order,
      enabled: s.enabled,
      on_fail: s.on_fail,
      max_api_calls: s.max_api_calls,
      config_json: s.config_json,
      label: FLOW_STEP_CATALOG[s.step_key]?.label ?? s.step_key
    }))
  };
}

export async function saveFlowMeta(
  id: number,
  patch: { name?: string; description?: string; active?: boolean }
) {
  const sets: string[] = ["updated_at = @now"];
  const params: Record<string, string | number | boolean> = { id, now: nowIso() };
  if (patch.name != null) {
    sets.push("name = @name");
    params.name = patch.name;
  }
  if (patch.description != null) {
    sets.push("description = @description");
    params.description = patch.description;
  }
  if (patch.active != null) {
    sets.push("active = @active");
    params.active = patch.active;
  }
  await run(`UPDATE lead_generation_flows SET ${sets.join(", ")} WHERE id = @id`, params);
}

type FlowStepTemplate = {
  step_key: FlowStepKey;
  sort_order: number;
  on_fail: "continue" | "stop";
  max_api_calls: number | null;
};

const DEFAULT_STEPS_BY_INITIAL_SOURCE: Record<FlowInitialSource, FlowStepTemplate[]> = {
  anp_retail: [
    { step_key: "anp_retail_list", sort_order: 10, on_fail: "continue", max_api_calls: null },
    { step_key: "validate_cnpj", sort_order: 20, on_fail: "continue", max_api_calls: null },
    { step_key: "google_place_search", sort_order: 30, on_fail: "stop", max_api_calls: 2 },
    { step_key: "google_place_details", sort_order: 40, on_fail: "continue", max_api_calls: 1 },
    { step_key: "receita_cnpj", sort_order: 50, on_fail: "continue", max_api_calls: 1 },
    { step_key: "website_enrich", sort_order: 60, on_fail: "continue", max_api_calls: null },
    { step_key: "instagram_enrich", sort_order: 70, on_fail: "continue", max_api_calls: null },
    { step_key: "create_crm_client", sort_order: 90, on_fail: "stop", max_api_calls: null }
  ],
  anp_distributor: [
    { step_key: "anp_distributor_list", sort_order: 10, on_fail: "continue", max_api_calls: null },
    { step_key: "validate_cnpj", sort_order: 20, on_fail: "continue", max_api_calls: null },
    { step_key: "google_place_search", sort_order: 30, on_fail: "stop", max_api_calls: 2 },
    { step_key: "google_place_details", sort_order: 40, on_fail: "continue", max_api_calls: 1 },
    { step_key: "receita_cnpj", sort_order: 50, on_fail: "continue", max_api_calls: 1 },
    { step_key: "website_enrich", sort_order: 60, on_fail: "continue", max_api_calls: null },
    { step_key: "instagram_enrich", sort_order: 70, on_fail: "continue", max_api_calls: null },
    { step_key: "create_crm_client", sort_order: 90, on_fail: "stop", max_api_calls: null }
  ],
  google_places_city: [
    { step_key: "google_places_city_discover", sort_order: 10, on_fail: "continue", max_api_calls: 25 },
    { step_key: "google_place_details", sort_order: 30, on_fail: "continue", max_api_calls: 1 },
    { step_key: "validate_cnpj", sort_order: 35, on_fail: "continue", max_api_calls: null },
    { step_key: "receita_cnpj", sort_order: 50, on_fail: "continue", max_api_calls: 1 },
    { step_key: "website_enrich", sort_order: 60, on_fail: "continue", max_api_calls: null },
    { step_key: "instagram_enrich", sort_order: 70, on_fail: "continue", max_api_calls: null },
    { step_key: "create_crm_client", sort_order: 90, on_fail: "stop", max_api_calls: null }
  ]
};

function slugifyFlowName(name: string): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "fluxo";
  return base.slice(0, 80);
}

async function uniqueFlowSlug(base: string): Promise<string> {
  let slug = base;
  let n = 2;
  while (await get<{ id: number }>("SELECT id FROM lead_generation_flows WHERE slug = @slug LIMIT 1", { slug })) {
    slug = `${base}_${n}`.slice(0, 96);
    n += 1;
  }
  return slug;
}

export async function createLeadGenerationFlow(input: {
  name: string;
  description?: string;
  initial_source: FlowInitialSource;
  active?: boolean;
}): Promise<LeadGenerationFlowRow> {
  const name = input.name.trim();
  if (!name) throw new Error("Informe o nome do fluxo.");
  const slug = await uniqueFlowSlug(slugifyFlowName(name));
  const now = nowIso();
  const inserted = await run(
    `
      INSERT INTO lead_generation_flows (slug, name, description, active, initial_source, created_at, updated_at)
      VALUES (@slug, @name, @description, @active, @initialSource, @now, @now)
    `,
    {
      slug,
      name,
      description: (input.description ?? "").trim(),
      active: input.active !== false,
      initialSource: input.initial_source,
      now
    }
  );
  const flowId = inserted.lastInsertRowid;
  if (flowId == null) throw new Error("Não foi possível criar o fluxo.");
  const templates = DEFAULT_STEPS_BY_INITIAL_SOURCE[input.initial_source];
  const steps: FlowStepRow[] = templates.map((t, index) => ({
    id: index + 1,
    step_key: t.step_key,
    sort_order: t.sort_order,
    enabled: true,
    on_fail: t.on_fail,
    max_api_calls: t.max_api_calls,
    config_json: {}
  }));
  await saveFlowSteps(flowId, steps);
  const flow = await getLeadGenerationFlow(flowId);
  if (!flow) throw new Error("Fluxo criado mas não encontrado.");
  return flow;
}

export async function saveFlowSteps(flowId: number, steps: FlowStepRow[]) {
  for (const s of steps) {
    if (!isFlowStepKey(s.step_key)) continue;
    await run(
      `
        INSERT INTO lead_generation_flow_steps (flow_id, step_key, sort_order, enabled, on_fail, max_api_calls, config_json)
        VALUES (@flowId, @stepKey, @sortOrder, @enabled, @onFail, @maxCalls, @config::jsonb)
        ON CONFLICT (flow_id, step_key) DO UPDATE SET
          sort_order = EXCLUDED.sort_order,
          enabled = EXCLUDED.enabled,
          on_fail = EXCLUDED.on_fail,
          max_api_calls = EXCLUDED.max_api_calls,
          config_json = EXCLUDED.config_json
      `,
      {
        flowId,
        stepKey: s.step_key,
        sortOrder: s.sort_order,
        enabled: s.enabled,
        onFail: s.on_fail,
        maxCalls: s.max_api_calls,
        config: JSON.stringify(s.config_json ?? {})
      }
    );
  }
}

export async function setSegmentDefaultFlow(segmentSlug: string, flowId: number | null) {
  await run(
    "UPDATE lead_generation_segments SET default_flow_id = @flowId, updated_at = @now WHERE slug = @slug",
    { flowId, slug: segmentSlug, now: nowIso() }
  );
}

export function parseFlowSnapshot(raw: unknown): FlowSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as FlowSnapshot;
  if (!o.slug || !Array.isArray(o.steps)) return null;
  return o;
}
