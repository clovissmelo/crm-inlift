import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { previewLeadSelection } from "@/lib/lead-generation/run-processor";
import type { LeadGenFilters } from "@/lib/lead-generation/types";
import { normalizeLeadGenFilters, ufHasMotorMapping } from "@/lib/lead-generation/city-resolve";
import { getGooglePlacesApiKey } from "@/lib/google-places-settings";
import { leadGenSegmentZod } from "@/lib/lead-generation/segment-schema";
import { z } from "zod";

const bodySchema = z.object({
  uf: z.string().length(2),
  cities: z.array(z.string()).default([]),
  regions: z.array(z.string()).default([]),
  all_cities_in_uf: z.boolean().default(false),
  segment: leadGenSegmentZod.default("all"),
  max_stations: z.number().int().min(1).max(500).default(50),
  preview_max_cities: z.number().int().min(1).max(60).optional()
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
  if (!ufHasMotorMapping(uf)) {
    return Response.json(
      { error: `UF ${uf} ainda não tem cidades mapeadas no motor ANP. Disponíveis: RS e PR.` },
      { status: 400 }
    );
  }

  const filters: LeadGenFilters = normalizeLeadGenFilters(uf, {
    cities: parsed.data.cities,
    regions: parsed.data.regions,
    all_cities_in_uf: parsed.data.all_cities_in_uf,
    segment: parsed.data.segment
  });

  if (!filters.all_cities_in_uf && filters.cities.length === 0) {
    return Response.json({ error: "Selecione ao menos uma cidade ou região, ou marque todas da UF." }, { status: 400 });
  }

  const preview = await previewLeadSelection({
    uf,
    filters,
    max_stations: parsed.data.max_stations,
    max_cities: parsed.data.preview_max_cities ?? (parsed.data.all_cities_in_uf ? 3 : undefined)
  });

  const hasGoogleKey = Boolean(await getGooglePlacesApiKey());

  return Response.json({
    estimated_total: preview.stations.length,
    unique_cnpjs: new Set(preview.stations.map((s) => s.cnpj)).size,
    existing_in_crm: preview.existing_in_crm,
    new_estimated: Math.max(0, new Set(preview.stations.map((s) => s.cnpj)).size - preview.existing_in_crm),
    cities_scanned: preview.cities_scanned,
    cities_total: preview.cities_total,
    preview_complete: preview.complete,
    google_enrichment_available: hasGoogleKey,
    unavailable_without_google: hasGoogleKey
      ? []
      : ["Telefone e site via Google Places", "Validação de correspondência do estabelecimento"]
  });
}
