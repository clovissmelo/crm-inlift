import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { listOfficialCitiesForUf } from "@/lib/lead-motor/anp-cities";
import { listRegionsForUf } from "@/lib/lead-motor/anp-regions";
import { BRAZIL_UFS } from "@/lib/lead-motor/brazil-ufs";
import { motorMappedUfs, ufHasMotorMapping } from "@/lib/lead-generation/city-resolve";
import { getLoadedGeoForUf } from "@/lib/lead-generation/loaded-geo";

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
    return Response.json({ ufs, motor_mapped_ufs: motorMappedUfs() });
  }

  if (!BRAZIL_UFS.some((x) => x.code === ufParam)) {
    return Response.json({ error: "UF inválida" }, { status: 400 });
  }

  const loaded = await getLoadedGeoForUf(ufParam);
  const regionDefs = listRegionsForUf(ufParam);
  const cityToRegions = new Map<string, string[]>();
  for (const reg of regionDefs) {
    for (const c of reg.cities) {
      const prev = cityToRegions.get(c) ?? [];
      prev.push(reg.id);
      cityToRegions.set(c, prev);
    }
  }

  const cities = listOfficialCitiesForUf(ufParam).map((name) => ({
    name,
    loaded: loaded.cities.has(name),
    region_ids: cityToRegions.get(name) ?? []
  }));

  const regions = regionDefs.map((r) => ({
    id: r.id,
    label: r.label,
    city_count: r.cities.length,
    loaded: loaded.regions.has(r.id)
  }));

  return Response.json({
    uf: ufParam,
    has_motor_mapping: ufHasMotorMapping(ufParam),
    regions,
    cities
  });
}
