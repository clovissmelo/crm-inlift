import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { ensureCommercialZonesForUf } from "@/lib/lead-generation/commercial-zones";
import { getMunicipalitiesForUf } from "@/lib/lead-generation/ibge-localidades";
import { municipalityAnpSupported } from "@/lib/lead-generation/city-resolve-ibge";
import { BRAZIL_UFS } from "@/lib/lead-motor/brazil-ufs";
import { ufHasMotorMapping } from "@/lib/lead-generation/city-resolve";

export async function GET(request: Request) {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;

  const url = new URL(request.url);
  const ufParam = url.searchParams.get("uf")?.toUpperCase() ?? "";

  const ufs = BRAZIL_UFS.map((x) => ({
    code: x.code,
    name: x.name,
    has_motor_mapping: ufHasMotorMapping(x.code)
  }));

  if (!ufParam) {
    return Response.json({ ufs });
  }

  if (!BRAZIL_UFS.some((x) => x.code === ufParam)) {
    return Response.json({ error: "UF inválida" }, { status: 400 });
  }

  let ibge: Awaited<ReturnType<typeof getMunicipalitiesForUf>>;
  try {
    ibge = await getMunicipalitiesForUf(ufParam);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao carregar municípios";
    if (/lead_generation_ibge_uf_cache|does not exist|relation/i.test(msg)) {
      return Response.json(
        {
          error:
            "Tabela lead_generation_ibge_uf_cache ausente neste banco. No Supabase (mesmo projeto do POSTGRES_URL da Vercel), rode migrations/029_lead_generation_ibge_cache_ensure.sql ou faça deploy recente do CRM."
        },
        { status: 503 }
      );
    }
    return Response.json({ error: msg }, { status: 502 });
  }
  let zones: Awaited<ReturnType<typeof ensureCommercialZonesForUf>> = [];
  try {
    zones = await ensureCommercialZonesForUf(ufParam, ibge.municipalities);
  } catch {
    zones = [];
  }

  const ibgeToZones = new Map<number, number[]>();
  for (const z of zones) {
    for (const code of z.ibge_codes) {
      const prev = ibgeToZones.get(code) ?? [];
      prev.push(z.id);
      ibgeToZones.set(code, prev);
    }
  }

  const municipalities = ibge.municipalities.map((m) => ({
    ibge_code: m.ibge_code,
    name: m.name,
    zone_ids: ibgeToZones.get(m.ibge_code) ?? [],
    anp_supported: municipalityAnpSupported(ufParam, m)
  }));

  const anp_supported_count = municipalities.filter((m) => m.anp_supported).length;

  return Response.json({
    uf: ufParam,
    has_motor_mapping: ufHasMotorMapping(ufParam),
    source: ibge.source,
    ibge_warning: ibge.ibge_warning,
    fetched_at: ibge.fetched_at,
    anp_supported_count,
    zones: zones.map((z) => ({
      id: z.id,
      name: z.name,
      ibge_count: z.ibge_codes.length
    })),
    municipalities
  });
}
