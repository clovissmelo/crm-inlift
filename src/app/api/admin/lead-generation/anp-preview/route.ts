import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { previewAnpPostosByCity } from "@/lib/lead-generation/anp-city-preview";
import { resolveCityPairsFromMunicipalities } from "@/lib/lead-generation/city-resolve-ibge";
import {
  buildFlowSnapshot,
  getDefaultFlowForSegment,
  getLeadGenerationFlow
} from "@/lib/lead-generation/flows-repo";
import { getUfGeoFromIbge } from "@/lib/lead-generation/ibge-localidades";
import type { LeadGenFilters, LeadGenMunicipalityRef } from "@/lib/lead-generation/types";
import { getProduct } from "@/lib/products";
import { leadGenSegmentZod } from "@/lib/lead-generation/segment-schema";
import { listLeadGenSegments, resolveSegmentFilterKind } from "@/lib/lead-generation/segments-repo";
import { z } from "zod";

export const maxDuration = 60;

const municipalitySchema = z.object({
  ibge_code: z.number().int(),
  name: z.string().min(1).max(120),
  commercial_zone_id: z.number().int().positive().nullable().optional(),
  ibge_immediate_region_id: z.number().int().positive().nullable().optional(),
  ibge_immediate_region_name: z.string().max(200).nullable().optional()
});

const bodySchema = z.object({
  uf: z.string().length(2),
  municipalities: z.array(municipalitySchema).default([]),
  commercial_zone_ids: z.array(z.number().int().positive()).default([]),
  all_cities_in_uf: z.boolean().default(false),
  segment: leadGenSegmentZod.default("all"),
  product_id: z.number().int().positive().nullable().optional(),
  max_stations: z.number().int().min(1).max(500).optional()
});

export async function POST(request: Request) {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json());
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

  const segmentRow = activeSegments.find((s) => s.slug === segmentSlug);
  const flow =
    (productFlowId ? await getLeadGenerationFlow(productFlowId) : null) ??
    (segmentRow?.default_flow_id ? await getLeadGenerationFlow(segmentRow.default_flow_id) : null) ??
    (await getDefaultFlowForSegment(segmentSlug));

  const initialSource = flow ? buildFlowSnapshot(flow).initial_source : "anp_retail";
  if (initialSource !== "anp_retail") {
    return Response.json({
      supported: false,
      initial_source: initialSource,
      message: "Prévia por cidade usa a API ANP (revendedores). Este fluxo usa outra fonte inicial."
    });
  }

  const segment_filter_kind = await resolveSegmentFilterKind(segmentSlug);
  const ibge = await getUfGeoFromIbge(uf);

  const selected: LeadGenMunicipalityRef[] = parsed.data.municipalities.map((m) => ({
    ibge_code: m.ibge_code,
    name: m.name,
    commercial_zone_id: m.commercial_zone_id ?? null,
    ibge_immediate_region_id: m.ibge_immediate_region_id ?? null,
    ibge_immediate_region_name: m.ibge_immediate_region_name ?? null
  }));

  if (
    !parsed.data.all_cities_in_uf &&
    selected.length === 0 &&
    parsed.data.commercial_zone_ids.length > 0
  ) {
    const zoneSet = new Set(parsed.data.commercial_zone_ids);
    for (const m of ibge.municipalities) {
      if (m.immediate_region_id != null && zoneSet.has(m.immediate_region_id)) {
        selected.push({
          ibge_code: m.ibge_code,
          name: m.name,
          commercial_zone_id: m.immediate_region_id,
          ibge_immediate_region_id: m.immediate_region_id,
          ibge_immediate_region_name: m.immediate_region_name
        });
      }
    }
  }

  if (!parsed.data.all_cities_in_uf && selected.length === 0) {
    return Response.json({ error: "Selecione cidades ou zonas, ou marque todas da UF." }, { status: 400 });
  }

  const { pairs, municipalities } = resolveCityPairsFromMunicipalities(
    uf,
    selected,
    ibge.municipalities,
    parsed.data.all_cities_in_uf
  );

  if (pairs.length === 0) {
    return Response.json({
      error: "Nenhuma cidade válida para consulta ANP nesta seleção."
    }, { status: 400 });
  }

  const filtersForRun: LeadGenFilters = {
    cities: pairs.map((p) => p.official),
    municipalities,
    commercial_zone_ids: parsed.data.commercial_zone_ids,
    all_cities_in_uf: parsed.data.all_cities_in_uf,
    segment: segmentSlug,
    segment_filter_kind
  };

  const preview = await previewAnpPostosByCity({
    uf,
    filters: filtersForRun,
    segmentFilter: segment_filter_kind
  });

  const meta = parsed.data.max_stations ?? 1;
  const volume_ok = preview.new_estimated >= meta;
  const volume_hint =
    preview.total_postos === 0
      ? "A ANP não retornou postos no segmento para as cidades consultadas."
      : !volume_ok
        ? `Há cerca de ${preview.new_estimated} CNPJ novo(s) estimado(s) — abaixo da meta de ${meta}. Amplie cidades ou ajuste a meta.`
        : `Volume suficiente para buscar até ${meta} lead(s) novo(s) (estimativa).`;

  return Response.json({
    supported: true,
    segment: segmentSlug,
    max_stations: meta,
    volume_ok,
    volume_hint,
    ...preview
  });
}
