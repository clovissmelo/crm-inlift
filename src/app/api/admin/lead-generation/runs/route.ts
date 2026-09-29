import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { resolveCityPairsFromMunicipalities } from "@/lib/lead-generation/city-resolve-ibge";
import { drainLeadGenerationTicks } from "@/lib/lead-generation/drain-ticks";
import { getMunicipalitiesForUf } from "@/lib/lead-generation/ibge-localidades";
import { persistRunMunicipalities } from "@/lib/lead-generation/municipality-runs";
import { createLeadGenerationRun, listLeadGenerationRuns } from "@/lib/lead-generation/runs-repo";
import { getGooglePlacesApiKey, getGooglePlacesLimit } from "@/lib/google-places-settings";
import { getDailyGoogleUsage } from "@/lib/lead-generation/quota";
import type { LeadGenFilters, LeadGenMunicipalityRef } from "@/lib/lead-generation/types";
import { leadGenSegmentZod } from "@/lib/lead-generation/segment-schema";
import { z } from "zod";

const municipalitySchema = z.object({
  ibge_code: z.number().int(),
  name: z.string().min(1).max(120),
  commercial_zone_id: z.number().int().positive().nullable().optional()
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
  max_stations: z.number().int().min(1).max(500).optional()
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
  const ibge = await getMunicipalitiesForUf(uf);

  let selected: LeadGenMunicipalityRef[] = parsed.data.municipalities.map((m) => ({
    ibge_code: m.ibge_code,
    name: m.name,
    commercial_zone_id: m.commercial_zone_id ?? null
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

  if (pairs.length === 0) {
    const hint =
      skipped.length > 0
        ? "Nenhuma cidade selecionada tem consulta ANP disponível. Ajuste a seleção (RS/PR têm mapa completo)."
        : "Nenhuma cidade válida na seleção.";
    return Response.json({ error: hint }, { status: 400 });
  }

  const filtersForRun: LeadGenFilters = {
    cities: pairs.map((p) => p.official),
    municipalities,
    commercial_zone_ids: parsed.data.commercial_zone_ids,
    regions: parsed.data.regions,
    all_cities_in_uf: parsed.data.all_cities_in_uf,
    segment: parsed.data.segment
  };

  const hasKey = Boolean(await getGooglePlacesApiKey());
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
    cities_total: pairs.length
  });

  await persistRunMunicipalities(
    id,
    municipalities.map((m) => ({
      ibge_code: m.ibge_code,
      name: m.name,
      uf,
      commercial_zone_id: m.commercial_zone_id
    }))
  );

  await drainLeadGenerationTicks({ runId: id, maxTicks: 18, maxMs: 55_000 });

  return Response.json({ id, status: "queued", skipped_municipalities: skipped.length });
}
