import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { resolveCityPairsFromMunicipalities } from "@/lib/lead-generation/city-resolve-ibge";
import { drainLeadGenerationTicks } from "@/lib/lead-generation/drain-ticks";
import { buildFlowSnapshot, getDefaultFlowForSegment, getLeadGenerationFlow } from "@/lib/lead-generation/flows-repo";
import { getUfGeoFromIbge } from "@/lib/lead-generation/ibge-localidades";
import { persistRunMunicipalities } from "@/lib/lead-generation/municipality-runs";
import { createLeadGenerationRun, listLeadGenerationRuns } from "@/lib/lead-generation/runs-repo";
import { getProduct } from "@/lib/products";
import { getGooglePlacesApiKey, getGooglePlacesLimit } from "@/lib/google-places-settings";
import { getDailyGoogleUsage } from "@/lib/lead-generation/quota";
import type { LeadGenFilters, LeadGenMunicipalityRef } from "@/lib/lead-generation/types";
import { leadGenSegmentZod } from "@/lib/lead-generation/segment-schema";
import { listLeadGenSegments, resolveSegmentFilterKind } from "@/lib/lead-generation/segments-repo";
import { z } from "zod";

const municipalitySchema = z.object({
  ibge_code: z.number().int(),
  name: z.string().min(1).max(120),
  commercial_zone_id: z.number().int().positive().nullable().optional(),
  ibge_immediate_region_id: z.number().int().positive().nullable().optional(),
  ibge_immediate_region_name: z.string().max(200).nullable().optional()
});

const createSchema = z.object({
  uf: z.string().length(2),
  municipalities: z.array(municipalitySchema).default([]),
  commercial_zone_ids: z.array(z.number().int().positive()).default([]),
  cities: z.array(z.string()).default([]),
  regions: z.array(z.string()).default([]),
  all_cities_in_uf: z.boolean().default(false),
  segment: leadGenSegmentZod.default("all"),
  product_id: z.number().int().positive().nullable().optional(),
  company_id: z.number().int().positive().nullable().optional(),
  bdr_user_id: z.number().int().positive().nullable().optional(),
  max_stations: z.number().int().min(1).max(500).optional(),
  flow_id: z.number().int().positive().optional()
});

export const maxDuration = 60;

export async function GET() {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;
  const runs = await listLeadGenerationRuns(40);
  return Response.json({ runs });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const uf = parsed.data.uf.toUpperCase();
  let segmentSlug = parsed.data.segment;
  let productFlowId: number | null = null;
  if (parsed.data.product_id) {
    const product = await getProduct(parsed.data.product_id);
    if (product?.lead_gen_segment_slug) segmentSlug = product.lead_gen_segment_slug;
    if (product?.lead_gen_flow_id) productFlowId = product.lead_gen_flow_id;
  }
  const activeSegments = await listLeadGenSegments({ activeOnly: true });
  if (!activeSegments.some((s) => s.slug === segmentSlug)) {
    return Response.json({ error: "Segmento inválido ou inativo." }, { status: 400 });
  }
  const segment_filter_kind = await resolveSegmentFilterKind(segmentSlug);
  const segmentRow = activeSegments.find((s) => s.slug === segmentSlug);
  const flow =
    (productFlowId ? await getLeadGenerationFlow(productFlowId) : null) ??
    (parsed.data.flow_id ? await getLeadGenerationFlow(parsed.data.flow_id) : null) ??
    (segmentRow?.default_flow_id ? await getLeadGenerationFlow(segmentRow.default_flow_id) : null) ??
    (await getDefaultFlowForSegment(segmentSlug));
  if (!flow || !flow.active) {
    return Response.json({ error: "Fluxo de geração inválido ou inativo." }, { status: 400 });
  }
  const flowSnapshot = buildFlowSnapshot(flow);
  const initialSource = flowSnapshot.initial_source;
  const ibge = await getUfGeoFromIbge(uf);

  const selected: LeadGenMunicipalityRef[] = parsed.data.municipalities.map((m) => ({
    ibge_code: m.ibge_code,
    name: m.name,
    commercial_zone_id: m.commercial_zone_id ?? null,
    ibge_immediate_region_id: m.ibge_immediate_region_id ?? null,
    ibge_immediate_region_name: m.ibge_immediate_region_name ?? null
  }));

  if (!parsed.data.all_cities_in_uf && selected.length === 0) {
    return Response.json({ error: "Selecione uma ou mais cidades, zonas comerciais ou marque todas da UF." }, { status: 400 });
  }

  const { pairs, municipalities, skipped } = resolveCityPairsFromMunicipalities(
    uf,
    selected,
    ibge.municipalities,
    parsed.data.all_cities_in_uf
  );
  const hasKey = Boolean(await getGooglePlacesApiKey());

  if (pairs.length === 0 && initialSource === "anp_retail") {
    const hint =
      skipped.length > 0
        ? "Nenhuma cidade selecionada tem consulta ANP disponível. Ajuste a seleção (RS/PR têm mapa completo)."
        : "Nenhuma cidade válida na seleção.";
    return Response.json({ error: hint }, { status: 400 });
  }

  if (pairs.length === 0 && (initialSource === "google_places_city" || initialSource === "anp_distributor")) {
    if (parsed.data.all_cities_in_uf) {
      for (const m of ibge.municipalities) {
        pairs.push({ official: m.name, api: m.name });
        municipalities.push({
          ibge_code: m.ibge_code,
          name: m.name,
          commercial_zone_id: null,
          ibge_immediate_region_id: m.immediate_region_id,
          ibge_immediate_region_name: m.immediate_region_name
        });
      }
    } else if (selected.length > 0) {
      for (const m of selected) {
        pairs.push({ official: m.name, api: m.name });
        if (!municipalities.some((x) => x.ibge_code === m.ibge_code)) {
          municipalities.push({
            ibge_code: m.ibge_code,
            name: m.name,
            commercial_zone_id: m.commercial_zone_id ?? null,
            ibge_immediate_region_id: m.ibge_immediate_region_id ?? null,
            ibge_immediate_region_name: m.ibge_immediate_region_name ?? null
          });
        }
      }
    }
  }

  if (pairs.length === 0) {
    return Response.json({ error: "Nenhuma cidade válida na seleção." }, { status: 400 });
  }

  if (initialSource === "google_places_city" && !hasKey) {
    return Response.json({ error: "Fluxo Tradicional exige Google Places configurado." }, { status: 400 });
  }

  const filtersForRun: LeadGenFilters = {
    cities: pairs.map((p) => p.official),
    municipalities,
    commercial_zone_ids: parsed.data.commercial_zone_ids,
    regions: parsed.data.regions,
    all_cities_in_uf: parsed.data.all_cities_in_uf,
    segment: segmentSlug,
    segment_filter_kind
  };

  const [perRunLimit, dailyLimit, usedToday] = await Promise.all([
    getGooglePlacesLimit("google_places_per_run_limit"),
    getGooglePlacesLimit("google_places_daily_limit"),
    getDailyGoogleUsage()
  ]);
  const requested = parsed.data.max_stations ?? perRunLimit;
  const maxStations = Math.min(Math.max(1, requested), perRunLimit, 500);
  const availableToday = Math.max(0, dailyLimit - usedToday);
  const simulation = !hasKey;
  const maxGoogle = simulation
    ? 0
    : Math.min(perRunLimit, availableToday, Math.max(1, maxStations * 2));

  const id = await createLeadGenerationRun({
    requested_by_user_id: user!.id,
    uf,
    filters: filtersForRun,
    product_id: parsed.data.product_id ?? null,
    company_id: parsed.data.company_id ?? null,
    bdr_user_id: parsed.data.bdr_user_id ?? null,
    max_stations: maxStations,
    max_google_calls: maxGoogle,
    simulation,
    cities_total: pairs.length,
    flow_id: flow.id,
    flow_snapshot_json: flowSnapshot
  });

  await persistRunMunicipalities(
    id,
    municipalities.map((m) => ({
      ibge_code: m.ibge_code,
      name: m.name,
      uf,
      commercial_zone_id: m.commercial_zone_id,
      ibge_immediate_region_id: m.ibge_immediate_region_id ?? null,
      ibge_immediate_region_name: m.ibge_immediate_region_name ?? null
    }))
  );

  await drainLeadGenerationTicks({ runId: id, maxTicks: 18, maxMs: 55_000 });

  return Response.json({
    id,
    status: "queued",
    skipped_municipalities: skipped.length,
    flow: { id: flow.id, name: flow.name, snapshot: flowSnapshot }
  });
}
