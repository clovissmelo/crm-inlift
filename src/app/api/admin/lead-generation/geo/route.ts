import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { municipalityAnpSupported } from "@/lib/lead-generation/city-resolve-ibge";
import { getUfGeoFromIbge } from "@/lib/lead-generation/ibge-localidades";
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

  let geo: Awaited<ReturnType<typeof getUfGeoFromIbge>>;
  try {
    geo = await getUfGeoFromIbge(ufParam);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao carregar localidades";
    if (/lead_generation_ibge_uf_cache|does not exist|relation/i.test(msg)) {
      return Response.json(
        {
          error:
            "Tabela lead_generation_ibge_uf_cache ausente neste banco. Rode migrations/029_lead_generation_ibge_cache_ensure.sql ou faça deploy recente do CRM."
        },
        { status: 503 }
      );
    }
    return Response.json({ error: msg }, { status: 502 });
  }

  const municipalities = geo.municipalities.map((m) => ({
    ibge_code: m.ibge_code,
    name: m.name,
    immediate_region_id: m.immediate_region_id,
    immediate_region_name: m.immediate_region_name,
    zone_ids: m.immediate_region_id ? [m.immediate_region_id] : [],
    anp_supported: municipalityAnpSupported(ufParam, m)
  }));

  const regionCounts = new Map<number, number>();
  for (const m of municipalities) {
    if (m.immediate_region_id) {
      regionCounts.set(m.immediate_region_id, (regionCounts.get(m.immediate_region_id) ?? 0) + 1);
    }
  }

  const anp_supported_count = municipalities.filter((m) => m.anp_supported).length;

  return Response.json({
    uf: ufParam,
    has_motor_mapping: ufHasMotorMapping(ufParam),
    source: geo.source,
    ibge_warning: geo.ibge_warning,
    fetched_at: geo.fetched_at,
    anp_supported_count,
    zones: geo.immediate_regions.map((z) => ({
      id: z.id,
      name: z.name,
      ibge_count: regionCounts.get(z.id) ?? 0
    })),
    municipalities
  });
}
