import { get, run, nowIso } from "@/lib/db";
import { listOfficialCitiesForUf } from "@/lib/lead-motor/anp-cities";

const IBGE_BASE = "https://servicodados.ibge.gov.br/api/v1/localidades";

export type IbgeImmediateRegion = {
  id: number;
  name: string;
};

export type IbgeMunicipality = {
  ibge_code: number;
  name: string;
  immediate_region_id: number | null;
  immediate_region_name: string | null;
};

type UfGeoCachePayload = {
  immediate_regions: IbgeImmediateRegion[];
  municipalities: IbgeMunicipality[];
};

const memoryUfCache = new Map<string, { expires: number; data: UfGeoCachePayload }>();
const MEMORY_TTL_MS = 10 * 60 * 1000;

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function isMissingIbgeCacheTableError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /lead_generation_ibge_uf_cache|does not exist|relation/i.test(msg);
}

function parseImmediateRegionFromMunicipality(raw: Record<string, unknown>): IbgeImmediateRegion | null {
  const direct = raw["regiao-imediata"];
  if (direct && typeof direct === "object") {
    const o = direct as Record<string, unknown>;
    const id = Number(o.id);
    const name = String(o.nome ?? o.name ?? "").trim();
    if (Number.isFinite(id) && id > 0 && name) return { id, name };
  }
  const micro = raw.microrregiao;
  if (micro && typeof micro === "object") {
    const nested = (micro as Record<string, unknown>)["regiao-imediata"];
    if (nested && typeof nested === "object") {
      const o = nested as Record<string, unknown>;
      const id = Number(o.id);
      const name = String(o.nome ?? o.name ?? "").trim();
      if (Number.isFinite(id) && id > 0 && name) return { id, name };
    }
  }
  return null;
}

async function fetchImmediateRegions(uf: string): Promise<IbgeImmediateRegion[]> {
  const url = `${IBGE_BASE}/estados/${encodeURIComponent(uf.toUpperCase())}/regioes-imediatas`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000)
  });
  if (!res.ok) throw new Error(`IBGE regiões imediatas HTTP ${res.status}`);
  const payload = (await res.json()) as Array<{ id: number; nome: string }>;
  if (!Array.isArray(payload)) throw new Error("Resposta IBGE inválida (regiões)");
  return payload
    .map((r) => ({ id: Number(r.id), name: String(r.nome ?? "").trim() }))
    .filter((r) => r.id > 0 && r.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

async function fetchMunicipalitiesWithRegions(uf: string): Promise<IbgeMunicipality[]> {
  const url = `${IBGE_BASE}/estados/${encodeURIComponent(uf.toUpperCase())}/municipios`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(25_000)
  });
  if (!res.ok) throw new Error(`IBGE municípios HTTP ${res.status}`);
  const payload = (await res.json()) as Array<Record<string, unknown>>;
  if (!Array.isArray(payload)) throw new Error("Resposta IBGE inválida (municípios)");
  return payload
    .map((m) => {
      const ibge_code = Number(m.id);
      const name = String(m.nome ?? "").trim();
      const region = parseImmediateRegionFromMunicipality(m);
      if (!Number.isFinite(ibge_code) || ibge_code <= 0 || !name) return null;
      return {
        ibge_code,
        name,
        immediate_region_id: region?.id ?? null,
        immediate_region_name: region?.name ?? null
      };
    })
    .filter((m): m is IbgeMunicipality => m != null)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

async function readDbCache(uf: string): Promise<{ data: UfGeoCachePayload; fetched_at: string; source: string } | null> {
  let row: { municipalities_json: unknown; source: string; fetched_at: string } | undefined;
  try {
    row = await get<{ municipalities_json: unknown; source: string; fetched_at: string }>(
      "SELECT municipalities_json, source, fetched_at FROM lead_generation_ibge_uf_cache WHERE uf = @uf",
      { uf: uf.toUpperCase() }
    );
  } catch (e) {
    if (isMissingIbgeCacheTableError(e)) return null;
    throw e;
  }
  if (!row) return null;
  const raw = row.municipalities_json;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const municipalitiesRaw = o.municipalities;
    const regionsRaw = o.immediate_regions;
    if (Array.isArray(municipalitiesRaw)) {
      const municipalities = municipalitiesRaw
        .map((x) => {
          if (!x || typeof x !== "object") return null;
          const m = x as Record<string, unknown>;
          const ibge_code = Number(m.ibge_code ?? m.id);
          const name = String(m.name ?? m.nome ?? "");
          if (!Number.isFinite(ibge_code) || !name) return null;
          return {
            ibge_code,
            name,
            immediate_region_id: m.immediate_region_id != null ? Number(m.immediate_region_id) : null,
            immediate_region_name: m.immediate_region_name != null ? String(m.immediate_region_name) : null
          } as IbgeMunicipality;
        })
        .filter((x): x is IbgeMunicipality => x != null);
      const immediate_regions = Array.isArray(regionsRaw)
        ? regionsRaw
            .map((r) => {
              if (!r || typeof r !== "object") return null;
              const z = r as Record<string, unknown>;
              const id = Number(z.id);
              const name = String(z.name ?? z.nome ?? "");
              if (!Number.isFinite(id) || !name) return null;
              return { id, name };
            })
            .filter((x): x is IbgeImmediateRegion => x != null)
        : [];
      if (municipalities.length > 0) {
        return {
          data: {
            immediate_regions: immediate_regions.length
              ? immediate_regions.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
              : dedupeRegionsFromMunicipalities(municipalities),
            municipalities
          },
          fetched_at: String(row.fetched_at),
          source: row.source
        };
      }
    }
  }
  if (Array.isArray(raw)) {
    const municipalities = raw
      .map((x) => {
        if (!x || typeof x !== "object") return null;
        const o = x as Record<string, unknown>;
        const ibge_code = Number(o.ibge_code ?? o.id);
        const name = String(o.name ?? o.nome ?? "");
        if (!Number.isFinite(ibge_code) || !name) return null;
        return {
          ibge_code,
          name,
          immediate_region_id: null,
          immediate_region_name: null
        } as IbgeMunicipality;
      })
      .filter((x): x is IbgeMunicipality => x != null);
    if (municipalities.length === 0) return null;
    return {
      data: { immediate_regions: [], municipalities },
      fetched_at: String(row.fetched_at),
      source: row.source
    };
  }
  return null;
}

async function writeDbCache(uf: string, data: UfGeoCachePayload, source: "ibge" | "cache" | "fallback") {
  const json = JSON.stringify({
    immediate_regions: data.immediate_regions,
    municipalities: data.municipalities
  });
  try {
    await run(
      `
        INSERT INTO lead_generation_ibge_uf_cache (uf, municipalities_json, fetched_at, source)
        VALUES (@uf, @json::jsonb, @now, @source)
        ON CONFLICT (uf) DO UPDATE SET
          municipalities_json = EXCLUDED.municipalities_json,
          fetched_at = EXCLUDED.fetched_at,
          source = EXCLUDED.source
      `,
      {
        uf: uf.toUpperCase(),
        json,
        now: nowIso(),
        source
      }
    );
  } catch (e) {
    if (isMissingIbgeCacheTableError(e)) return;
    throw e;
  }
}

function dedupeRegionsFromMunicipalities(municipalities: IbgeMunicipality[]): IbgeImmediateRegion[] {
  const map = new Map<number, string>();
  for (const m of municipalities) {
    if (m.immediate_region_id && m.immediate_region_name) {
      map.set(m.immediate_region_id, m.immediate_region_name);
    }
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function fallbackFromAnpNames(uf: string): IbgeMunicipality[] | null {
  const names = listOfficialCitiesForUf(uf);
  if (names.length === 0) return null;
  return names.map((name, i) => ({
    ibge_code: -(i + 1),
    name,
    immediate_region_id: null,
    immediate_region_name: null
  }));
}

async function fetchUfGeoFromIbge(uf: string): Promise<UfGeoCachePayload> {
  const [immediate_regions, municipalities] = await Promise.all([
    fetchImmediateRegions(uf),
    fetchMunicipalitiesWithRegions(uf)
  ]);
  const regionIds = new Set(immediate_regions.map((r) => r.id));
  for (const m of municipalities) {
    if (m.immediate_region_id && !regionIds.has(m.immediate_region_id) && m.immediate_region_name) {
      immediate_regions.push({ id: m.immediate_region_id, name: m.immediate_region_name });
      regionIds.add(m.immediate_region_id);
    }
  }
  immediate_regions.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return { immediate_regions, municipalities };
}

export type UfGeoResult = {
  uf: string;
  immediate_regions: IbgeImmediateRegion[];
  municipalities: IbgeMunicipality[];
  source: "ibge" | "cache" | "fallback";
  ibge_warning: string | null;
  fetched_at: string | null;
};

export async function getUfGeoFromIbge(uf: string): Promise<UfGeoResult> {
  const u = uf.toUpperCase();
  const mem = memoryUfCache.get(u);
  if (mem && mem.expires > Date.now()) {
    return {
      uf: u,
      immediate_regions: mem.data.immediate_regions,
      municipalities: mem.data.municipalities,
      source: "cache",
      ibge_warning: null,
      fetched_at: nowIso()
    };
  }

  try {
    const data = await fetchUfGeoFromIbge(u);
    memoryUfCache.set(u, { expires: Date.now() + MEMORY_TTL_MS, data });
    await writeDbCache(u, data, "ibge");
    return {
      uf: u,
      ...data,
      source: "ibge",
      ibge_warning: null,
      fetched_at: nowIso()
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao consultar IBGE";
    const cached = await readDbCache(u);
    if (cached) {
      const data = cached.data;
      memoryUfCache.set(u, { expires: Date.now() + MEMORY_TTL_MS, data });
      return {
        uf: u,
        immediate_regions: data.immediate_regions,
        municipalities: data.municipalities,
        source: "cache",
        ibge_warning: `API do IBGE indisponível (${msg}). Exibindo dados salvos em ${new Date(cached.fetched_at).toLocaleString("pt-BR")}.`,
        fetched_at: cached.fetched_at
      };
    }
    const fallbackMunicipalities = fallbackFromAnpNames(u);
    if (fallbackMunicipalities) {
      const data: UfGeoCachePayload = {
        immediate_regions: [],
        municipalities: fallbackMunicipalities
      };
      await writeDbCache(u, data, "fallback");
      memoryUfCache.set(u, { expires: Date.now() + MEMORY_TTL_MS, data });
      return {
        uf: u,
        ...data,
        source: "fallback",
        ibge_warning: `API do IBGE indisponível (${msg}). Lista provisória do mapa ANP (${u}); códigos IBGE podem estar incompletos.`,
        fetched_at: nowIso()
      };
    }
    return {
      uf: u,
      immediate_regions: [],
      municipalities: [],
      source: "fallback",
      ibge_warning: `API do IBGE indisponível (${msg}) e não há dados locais para ${u}. Tente novamente.`,
      fetched_at: null
    };
  }
}

/** Compat: só municípios (sem regiões) para rotas legadas. */
export type UfMunicipalitiesResult = {
  uf: string;
  municipalities: Array<{ ibge_code: number; name: string }>;
  source: "ibge" | "cache" | "fallback";
  ibge_warning: string | null;
  fetched_at: string | null;
};

export async function getMunicipalitiesForUf(uf: string): Promise<UfMunicipalitiesResult> {
  const geo = await getUfGeoFromIbge(uf);
  return {
    uf: geo.uf,
    municipalities: geo.municipalities.map((m) => ({ ibge_code: m.ibge_code, name: m.name })),
    source: geo.source,
    ibge_warning: geo.ibge_warning,
    fetched_at: geo.fetched_at
  };
}

export async function getMunicipalitiesForImmediateRegion(regionId: number): Promise<IbgeMunicipality[]> {
  const url = `${IBGE_BASE}/regioes-imediatas/${encodeURIComponent(String(regionId))}/municipios`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000)
  });
  if (!res.ok) throw new Error(`IBGE municípios da região HTTP ${res.status}`);
  const payload = (await res.json()) as Array<Record<string, unknown>>;
  if (!Array.isArray(payload)) throw new Error("Resposta IBGE inválida");
  const municipalities: IbgeMunicipality[] = [];
  for (const m of payload) {
    const ibge_code = Number(m.id);
    const name = String(m.nome ?? "").trim();
    const region = parseImmediateRegionFromMunicipality(m);
    if (!Number.isFinite(ibge_code) || ibge_code <= 0 || !name) continue;
    municipalities.push({
      ibge_code,
      name,
      immediate_region_id: region?.id ?? regionId,
      immediate_region_name: region?.name ?? null
    });
  }
  return municipalities.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function findIbgeByName(list: Array<{ ibge_code: number; name: string }>, name: string) {
  const n = normalizeName(name);
  return list.find((m) => normalizeName(m.name) === n);
}
