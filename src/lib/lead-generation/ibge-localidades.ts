import { get, run, nowIso } from "@/lib/db";
import { listOfficialCitiesForUf } from "@/lib/lead-motor/anp-cities";

export type IbgeMunicipality = {
  ibge_code: number;
  name: string;
};

const IBGE_UF_MUNICIPIOS = "https://servicodados.ibge.gov.br/api/v1/localidades/estados";

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

async function readCache(uf: string): Promise<{ municipalities: IbgeMunicipality[]; source: "cache" | "fallback"; fetched_at: string } | null> {
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
  if (!Array.isArray(raw)) return null;
  const municipalities = raw
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const ibge_code = Number(o.ibge_code ?? o.id);
      const name = String(o.name ?? o.nome ?? "");
      if (!Number.isFinite(ibge_code) || !name) return null;
      return { ibge_code, name };
    })
    .filter((x): x is IbgeMunicipality => x != null);
  if (municipalities.length === 0) return null;
  return {
    municipalities,
    source: row.source === "fallback" ? "fallback" : "cache",
    fetched_at: String(row.fetched_at)
  };
}

async function writeCache(uf: string, municipalities: IbgeMunicipality[], source: "ibge" | "cache" | "fallback") {
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
        json: JSON.stringify(municipalities),
        now: nowIso(),
        source
      }
    );
  } catch (e) {
    if (isMissingIbgeCacheTableError(e)) return;
    throw e;
  }
}

function fallbackFromAnpNames(uf: string): IbgeMunicipality[] | null {
  const names = listOfficialCitiesForUf(uf);
  if (names.length === 0) return null;
  return names.map((name, i) => ({
    ibge_code: -(i + 1),
    name
  }));
}

async function fetchFromIbgeApi(uf: string): Promise<IbgeMunicipality[]> {
  const url = `${IBGE_UF_MUNICIPIOS}/${encodeURIComponent(uf.toUpperCase())}/municipios`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000)
  });
  if (!res.ok) throw new Error(`IBGE respondeu HTTP ${res.status}`);
  const payload = (await res.json()) as Array<{ id: number; nome: string }>;
  if (!Array.isArray(payload)) throw new Error("Resposta IBGE inválida");
  return payload
    .map((m) => ({ ibge_code: Number(m.id), name: String(m.nome ?? "").trim() }))
    .filter((m) => m.ibge_code > 0 && m.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export type UfMunicipalitiesResult = {
  uf: string;
  municipalities: IbgeMunicipality[];
  source: "ibge" | "cache" | "fallback";
  ibge_warning: string | null;
  fetched_at: string | null;
};

/** Municípios da UF (IBGE), com cache local e fallback ANP (RS/PR) se a API falhar. */
export async function getMunicipalitiesForUf(uf: string): Promise<UfMunicipalitiesResult> {
  const u = uf.toUpperCase();
  try {
    const municipalities = await fetchFromIbgeApi(u);
    await writeCache(u, municipalities, "ibge");
    return {
      uf: u,
      municipalities,
      source: "ibge",
      ibge_warning: null,
      fetched_at: nowIso()
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao consultar IBGE";
    const cached = await readCache(u);
    if (cached) {
      return {
        uf: u,
        municipalities: cached.municipalities,
        source: "cache",
        ibge_warning: `API do IBGE indisponível (${msg}). Exibindo municípios salvos em ${new Date(cached.fetched_at).toLocaleString("pt-BR")}.`,
        fetched_at: cached.fetched_at
      };
    }
    const fallback = fallbackFromAnpNames(u);
    if (fallback) {
      await writeCache(u, fallback, "fallback");
      return {
        uf: u,
        municipalities: fallback,
        source: "fallback",
        ibge_warning: `API do IBGE indisponível (${msg}). Lista provisória do mapa ANP (${u}); códigos IBGE podem estar incompletos.`,
        fetched_at: nowIso()
      };
    }
    return {
      uf: u,
      municipalities: [],
      source: "fallback",
      ibge_warning: `API do IBGE indisponível (${msg}) e não há dados locais para ${u}. Tente novamente mais tarde.`,
      fetched_at: null
    };
  }
}

export function findIbgeByName(list: IbgeMunicipality[], name: string): IbgeMunicipality | undefined {
  const n = normalizeName(name);
  return list.find((m) => normalizeName(m.name) === n);
}
