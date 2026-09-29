import { all, run, nowIso } from "@/lib/db";

export type RunMunicipalityInput = {
  ibge_code: number;
  name: string;
  uf: string;
  commercial_zone_id?: number | null;
};

export async function persistRunMunicipalities(runId: number, municipalities: RunMunicipalityInput[]) {
  for (const m of municipalities) {
    if (m.ibge_code <= 0) continue;
    await run(
      `
        INSERT INTO lead_generation_municipalities (ibge_code, name, uf, updated_at)
        VALUES (@ibge, @name, @uf, @now)
        ON CONFLICT (ibge_code) DO UPDATE SET
          name = EXCLUDED.name,
          uf = EXCLUDED.uf,
          updated_at = EXCLUDED.updated_at
      `,
      { ibge: m.ibge_code, name: m.name, uf: m.uf.toUpperCase(), now: nowIso() }
    );
    await run(
      `
        INSERT INTO lead_generation_run_municipalities (run_id, ibge_code, commercial_zone_id)
        VALUES (@runId, @ibge, @zoneId)
        ON CONFLICT (run_id, ibge_code) DO UPDATE SET commercial_zone_id = EXCLUDED.commercial_zone_id
      `,
      { runId, ibge: m.ibge_code, zoneId: m.commercial_zone_id ?? null }
    );
  }
}

export type MunicipalityGenerationIndicator = {
  ibge_code: number;
  status: "completed" | "partial" | "failed";
  last_at: string;
  run_id: number;
};

/** Histórico por produto + segmento + município (lote). */
export async function getMunicipalityGenerationIndicators(input: {
  uf: string;
  product_id: number | null;
  segment: string;
  ibge_codes: number[];
}): Promise<MunicipalityGenerationIndicator[]> {
  const codes = [...new Set(input.ibge_codes.filter((c) => c > 0))];
  if (codes.length === 0) return [];

  const inList = codes.map((_, i) => `@c${i}`).join(", ");
  const params: Record<string, string | number | null> = {
    uf: input.uf.toUpperCase(),
    productId: input.product_id,
    segment: input.segment
  };
  codes.forEach((c, i) => {
    params[`c${i}`] = c;
  });

  const rows = await all<{
    ibge_code: number;
    status: string;
    completed_at: string | null;
    created_at: string;
    run_id: number;
  }>(
    `
      SELECT DISTINCT ON (rm.ibge_code)
        rm.ibge_code,
        r.status,
        r.completed_at,
        r.created_at,
        r.id AS run_id
      FROM lead_generation_run_municipalities rm
      INNER JOIN lead_generation_runs r ON r.id = rm.run_id
      WHERE rm.ibge_code IN (${inList})
        AND r.uf = @uf
        AND r.product_id IS NOT DISTINCT FROM @productId
        AND COALESCE(r.filters_json->>'segment', 'all') = @segment
        AND r.status IN ('completed', 'partial', 'failed')
      ORDER BY rm.ibge_code, r.completed_at DESC NULLS LAST, r.created_at DESC
    `,
    params
  );

  return rows.map((row) => ({
    ibge_code: Number(row.ibge_code),
    status: row.status as MunicipalityGenerationIndicator["status"],
    last_at: String(row.completed_at ?? row.created_at),
    run_id: Number(row.run_id)
  }));
}
