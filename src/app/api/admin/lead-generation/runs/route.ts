import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { createLeadGenerationRun, listLeadGenerationRuns } from "@/lib/lead-generation/runs-repo";
import { supportedUfs } from "@/lib/lead-generation/city-resolve";
import { isLeadGenSimulationDefault, getGooglePlacesLimit } from "@/lib/google-places-settings";
import type { LeadGenFilters } from "@/lib/lead-generation/types";
import { z } from "zod";

const createSchema = z.object({
  uf: z.string().length(2),
  cities: z.array(z.string()).default([]),
  all_cities_in_uf: z.boolean().default(false),
  segment: z.enum(["all", "white_flag_only"]).default("all"),
  product_id: z.number().int().positive().nullable().optional(),
  company_id: z.number().int().positive().nullable().optional(),
  bdr_user_id: z.number().int().positive().nullable().optional(),
  max_stations: z.number().int().min(1).max(500).default(50),
  max_google_calls: z.number().int().min(0).max(500).optional(),
  simulation: z.boolean().optional(),
  acknowledge_charges: z.boolean().optional()
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

  const simulationDefault = await isLeadGenSimulationDefault();
  const simulation = parsed.data.simulation ?? simulationDefault;
  if (!simulation && !parsed.data.acknowledge_charges) {
    return Response.json(
      { error: "Confirme que entende possíveis cobranças de API (Google Places) ou use modo simulação." },
      { status: 400 }
    );
  }

  const uf = parsed.data.uf.toUpperCase();
  if (!supportedUfs().includes(uf)) {
    return Response.json({ error: `UF ${uf} não disponível no motor.` }, { status: 400 });
  }
  if (!parsed.data.all_cities_in_uf && parsed.data.cities.length === 0) {
    return Response.json({ error: "Selecione cidades ou todas da UF." }, { status: 400 });
  }

  const perRunDefault = await getGooglePlacesLimit("google_places_per_run_limit");
  const maxGoogle =
    parsed.data.max_google_calls ??
    (simulation ? 0 : Math.min(perRunDefault, parsed.data.max_stations * 2));

  const filters: LeadGenFilters = {
    cities: parsed.data.cities,
    all_cities_in_uf: parsed.data.all_cities_in_uf,
    segment: parsed.data.segment
  };

  const id = await createLeadGenerationRun({
    requested_by_user_id: user!.id,
    uf,
    filters,
    product_id: parsed.data.product_id ?? null,
    company_id: parsed.data.company_id ?? null,
    bdr_user_id: parsed.data.bdr_user_id ?? null,
    max_stations: parsed.data.max_stations,
    max_google_calls: maxGoogle,
    simulation
  });

  return Response.json({ id, status: "queued" });
}
