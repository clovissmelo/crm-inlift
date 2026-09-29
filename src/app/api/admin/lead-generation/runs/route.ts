import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { createLeadGenerationRun, listLeadGenerationRuns } from "@/lib/lead-generation/runs-repo";
import { normalizeLeadGenFilters, resolveCityPairs, ufHasMotorMapping } from "@/lib/lead-generation/city-resolve";
import { getGooglePlacesApiKey, getGooglePlacesLimit } from "@/lib/google-places-settings";
import { getDailyGoogleUsage } from "@/lib/lead-generation/quota";
import type { LeadGenFilters } from "@/lib/lead-generation/types";
import { leadGenSegmentZod } from "@/lib/lead-generation/segment-schema";
import { z } from "zod";

const createSchema = z.object({
  uf: z.string().length(2),
  cities: z.array(z.string()).default([]),
  regions: z.array(z.string()).default([]),
  all_cities_in_uf: z.boolean().default(false),
  segment: leadGenSegmentZod.default("all"),
  product_id: z.number().int().positive().nullable().optional(),
  company_id: z.number().int().positive().nullable().optional(),
  bdr_user_id: z.number().int().positive().nullable().optional(),
  max_stations: z.number().int().min(1).max(500).optional()
});

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
  if (!ufHasMotorMapping(uf)) {
    return Response.json({ error: `UF ${uf} ainda não tem cidades mapeadas no motor ANP.` }, { status: 400 });
  }

  const filtersNormalized = normalizeLeadGenFilters(uf, {
    cities: parsed.data.cities,
    regions: parsed.data.regions,
    all_cities_in_uf: parsed.data.all_cities_in_uf,
    segment: parsed.data.segment
  });
  if (!filtersNormalized.all_cities_in_uf && filtersNormalized.cities.length === 0) {
    return Response.json({ error: "Selecione cidades, regiões ou marque “Todas mapeadas” na UF." }, { status: 400 });
  }

  const filtersForRun: LeadGenFilters = {
    cities: filtersNormalized.cities,
    regions: parsed.data.regions,
    all_cities_in_uf: parsed.data.all_cities_in_uf,
    segment: parsed.data.segment
  };
  const cityPairs = resolveCityPairs(uf, filtersForRun);
  if (cityPairs.length === 0) {
    return Response.json(
      {
        error: parsed.data.all_cities_in_uf
          ? `UF ${uf} sem cidades no mapa ANP.`
          : "Nenhuma cidade válida na seleção. Marque “Todas mapeadas”, zonas ou cidades."
      },
      { status: 400 }
    );
  }

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
    simulation
  });

  return Response.json({ id, status: "queued" });
}
