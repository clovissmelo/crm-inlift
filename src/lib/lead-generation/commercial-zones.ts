import { all, get, run } from "@/lib/db";
import { listRegionsForUf } from "@/lib/lead-motor/anp-regions";
import type { IbgeMunicipality } from "@/lib/lead-generation/ibge-localidades";
import { findIbgeByName } from "@/lib/lead-generation/ibge-localidades";

export type CommercialZone = {
  id: number;
  uf: string;
  name: string;
  legacy_key: string | null;
  ibge_codes: number[];
};

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/** Garante zonas legadas (PostoCred) no CRM e vínculos por nome ↔ IBGE. */
export async function ensureCommercialZonesForUf(uf: string, municipalities: IbgeMunicipality[]): Promise<CommercialZone[]> {
  const u = uf.toUpperCase();
  const legacy = listRegionsForUf(u);

  for (const reg of legacy) {
    const existing = await get<{ id: number }>(
      "SELECT id FROM lead_generation_commercial_zones WHERE legacy_key = @key LIMIT 1",
      { key: reg.id }
    );
    let zoneId = existing?.id;
    if (!zoneId) {
      await run(
        `
          INSERT INTO lead_generation_commercial_zones (uf, name, legacy_key)
          VALUES (@uf, @name, @key)
          ON CONFLICT (uf, name) DO UPDATE SET legacy_key = COALESCE(lead_generation_commercial_zones.legacy_key, EXCLUDED.legacy_key)
        `,
        { uf: u, name: reg.label, key: reg.id }
      );
      zoneId =
        (await get<{ id: number }>("SELECT id FROM lead_generation_commercial_zones WHERE legacy_key = @key LIMIT 1", { key: reg.id }))?.id ??
        (await get<{ id: number }>("SELECT id FROM lead_generation_commercial_zones WHERE uf = @uf AND name = @name LIMIT 1", {
          uf: u,
          name: reg.label
        }))?.id;
    }
    if (!zoneId) continue;

    for (const cityName of reg.cities) {
      const m =
        findIbgeByName(municipalities, cityName) ??
        municipalities.find((x) => normalizeName(x.name) === normalizeName(cityName));
      if (!m || m.ibge_code <= 0) continue;
      await run(
        `
          INSERT INTO lead_generation_commercial_zone_municipalities (zone_id, ibge_code)
          VALUES (@zoneId, @ibge)
          ON CONFLICT DO NOTHING
        `,
        { zoneId, ibge: m.ibge_code }
      );
    }
  }

  const rows = await all<{
    id: number;
    uf: string;
    name: string;
    legacy_key: string | null;
    ibge_code: number | null;
  }>(
    `
      SELECT z.id, z.uf, z.name, z.legacy_key, zm.ibge_code
      FROM lead_generation_commercial_zones z
      LEFT JOIN lead_generation_commercial_zone_municipalities zm ON zm.zone_id = z.id
      WHERE z.uf = @uf
      ORDER BY z.name, zm.ibge_code
    `,
    { uf: u }
  );

  const byId = new Map<number, CommercialZone>();
  for (const row of rows) {
    let z = byId.get(row.id);
    if (!z) {
      z = { id: row.id, uf: row.uf, name: row.name, legacy_key: row.legacy_key, ibge_codes: [] };
      byId.set(row.id, z);
    }
    if (row.ibge_code != null) z.ibge_codes.push(Number(row.ibge_code));
  }
  return [...byId.values()];
}

export function municipalitiesForZoneIds(zones: CommercialZone[], zoneIds: number[]): Set<number> {
  const set = new Set<number>();
  const pick = new Set(zoneIds);
  for (const z of zones) {
    if (!pick.has(z.id)) continue;
    for (const c of z.ibge_codes) set.add(c);
  }
  return set;
}
