import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { previewLeadSelection } from "@/lib/lead-generation/run-processor";
import type { LeadGenFilters } from "@/lib/lead-generation/types";
import { supportedUfs } from "@/lib/lead-generation/city-resolve";
import { getGooglePlacesApiKey } from "@/lib/google-places-settings";
import { z } from "zod";

const bodySchema = z.object({
  uf: z.string().length(2),
  cities: z.array(z.string()).default([]),
  all_cities_in_uf: z.boolean().default(false),
  segment: z.enum(["all", "white_flag_only"]).default("all"),
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
  if (!supportedUfs().includes(uf)) {
    return Response.json(
      { error: `UF ${uf} ainda não mapeada. Disponíveis: ${supportedUfs().join(", ")}` },
      { status: 400 }
    );
  }

  if (!parsed.data.all_cities_in_uf && parsed.data.cities.length === 0) {
    return Response.json({ error: "Informe ao menos uma cidade ou marque todas da UF." }, { status: 400 });
  }

  const filters: LeadGenFilters = {
    cities: parsed.data.cities,
    all_cities_in_uf: parsed.data.all_cities_in_uf,
    segment: parsed.data.segment
  };

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
