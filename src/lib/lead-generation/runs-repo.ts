import { all, get, run, nowIso } from "@/lib/db";
import { normalizeSegmentFilter } from "@/lib/lead-motor/lead-gen-segments";
import { emptyCounts, type LeadGenCounts, type LeadGenFilters, type LeadGenerationRunRow } from "@/lib/lead-generation/types";

function parseCounts(raw: unknown): LeadGenCounts {
  const base = emptyCounts();
  if (!raw || typeof raw !== "object") return base;
  return { ...base, ...(raw as Partial<LeadGenCounts>) };
}

function parseFilters(raw: unknown): LeadGenFilters {
  const d: LeadGenFilters = { cities: [], regions: [], all_cities_in_uf: false, segment: "all" };
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return d;
    }
  }
  if (!value || typeof value !== "object") return d;
  const o = value as Record<string, unknown>;
  if (Array.isArray(o.cities)) d.cities = o.cities.map(String);
  if (Array.isArray(o.regions)) d.regions = o.regions.map(String);
  if (o.all_cities_in_uf === true || o.all_cities_in_uf === "true" || o.all_cities_in_uf === 1) {
    d.all_cities_in_uf = true;
  }
  if (typeof o.segment === "string") d.segment = normalizeSegmentFilter(o.segment);
  return d;
}

function mapRun(row: Record<string, unknown>): LeadGenerationRunRow {
  return {
    id: Number(row.id),
    requested_by_user_id: Number(row.requested_by_user_id),
    status: String(row.status),
    phase: String(row.phase),
    uf: String(row.uf),
    filters_json: parseFilters(row.filters_json),
    product_id: row.product_id != null ? Number(row.product_id) : null,
    company_id: row.company_id != null ? Number(row.company_id) : null,
    bdr_user_id: row.bdr_user_id != null ? Number(row.bdr_user_id) : null,
    max_stations: Number(row.max_stations),
    max_google_calls: Number(row.max_google_calls),
    google_calls_used: Number(row.google_calls_used),
    simulation: Boolean(row.simulation),
    counts_json: parseCounts(row.counts_json),
    progress_pct: Number(row.progress_pct),
    error_message: row.error_message != null ? String(row.error_message) : null,
    cancel_requested: Boolean(row.cancel_requested),
    created_at: String(row.created_at),
    started_at: row.started_at != null ? String(row.started_at) : null,
    completed_at: row.completed_at != null ? String(row.completed_at) : null,
    updated_at: String(row.updated_at)
  };
}

export async function createLeadGenerationRun(input: {
  requested_by_user_id: number;
  uf: string;
  filters: LeadGenFilters;
  product_id: number | null;
  company_id: number | null;
  bdr_user_id: number | null;
  max_stations: number;
  max_google_calls: number;
  simulation: boolean;
}) {
  const counts = emptyCounts();
  const result = await run(
    `
      INSERT INTO lead_generation_runs (
        requested_by_user_id, status, phase, uf, filters_json,
        product_id, company_id, bdr_user_id, max_stations, max_google_calls,
        simulation, counts_json, progress_pct, created_at, updated_at
      ) VALUES (
        @userId, 'queued', 'anp_load', @uf, @filters::jsonb,
        @productId, @companyId, @bdrUserId, @maxStations, @maxGoogle,
        @simulation, @counts::jsonb, 0, @now, @now
      )
    `,
    {
      userId: input.requested_by_user_id,
      uf: input.uf.toUpperCase(),
      filters: JSON.stringify(input.filters),
      productId: input.product_id,
      companyId: input.company_id,
      bdrUserId: input.bdr_user_id,
      maxStations: input.max_stations,
      maxGoogle: input.max_google_calls,
      simulation: input.simulation,
      counts: JSON.stringify(counts),
      now: nowIso()
    }
  );
  return result.lastInsertRowid!;
}

export async function getLeadGenerationRun(id: number) {
  const row = await get<Record<string, unknown>>("SELECT * FROM lead_generation_runs WHERE id = @id", { id });
  return row ? mapRun(row) : null;
}

export async function deleteLeadGenerationRun(id: number) {
  const row = await getLeadGenerationRun(id);
  if (!row) throw new Error("Execução não encontrada");
  if (["queued", "running", "paused"].includes(row.status)) {
    throw new Error("Cancele a execução em andamento antes de excluir do histórico.");
  }
  await run("DELETE FROM lead_generation_runs WHERE id = @id", { id });
}

export async function listLeadGenerationRuns(limit = 30) {
  const rows = await all<Record<string, unknown>>(
    `
      SELECT r.*, u.name AS requested_by_name
      FROM lead_generation_runs r
      JOIN users u ON u.id = r.requested_by_user_id
      ORDER BY r.created_at DESC
      LIMIT @limit
    `,
    { limit }
  );
  return rows.map((r) => ({ ...mapRun(r), requested_by_name: String(r.requested_by_name) }));
}

export async function pickRunnableRunId(): Promise<number | null> {
  const row = await get<{ id: number }>(
    `
      SELECT id FROM lead_generation_runs
      WHERE status IN ('queued', 'running', 'paused')
        AND NOT (status = 'paused' AND cancel_requested = true)
      ORDER BY CASE status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END, updated_at ASC
      LIMIT 1
    `
  );
  return row?.id ?? null;
}

export async function updateRun(
  id: number,
  patch: Partial<{
    status: string;
    phase: string;
    counts_json: LeadGenCounts;
    progress_pct: number;
    error_message: string | null;
    started_at: string;
    completed_at: string;
  }>
) {
  const sets: string[] = ["updated_at = @now"];
  const params: Record<string, string | number | null> = { id, now: nowIso() };
  if (patch.status) {
    sets.push("status = @status");
    params.status = patch.status;
  }
  if (patch.phase) {
    sets.push("phase = @phase");
    params.phase = patch.phase;
  }
  if (patch.counts_json) {
    sets.push("counts_json = @counts::jsonb");
    params.counts = JSON.stringify(patch.counts_json);
  }
  if (patch.progress_pct != null) {
    sets.push("progress_pct = @pct");
    params.pct = patch.progress_pct;
  }
  if (patch.error_message !== undefined) {
    sets.push("error_message = @err");
    params.err = patch.error_message;
  }
  if (patch.started_at) {
    sets.push("started_at = @started");
    params.started = patch.started_at;
  }
  if (patch.completed_at) {
    sets.push("completed_at = @completed");
    params.completed = patch.completed_at;
  }
  await run(`UPDATE lead_generation_runs SET ${sets.join(", ")} WHERE id = @id`, params);
}

export async function requestCancelRun(id: number) {
  await run(
    "UPDATE lead_generation_runs SET cancel_requested = true, updated_at = @now WHERE id = @id AND status IN ('queued', 'running', 'paused')",
    { id, now: nowIso() }
  );
}

export async function resumeRun(id: number) {
  await run(
    `
      UPDATE lead_generation_runs SET status = 'running', cancel_requested = false, updated_at = @now
      WHERE id = @id AND status = 'paused' AND cancel_requested = false
    `,
    { id, now: nowIso() }
  );
}

export async function listRunItems(runId: number, status?: string) {
  const q = status
    ? "SELECT * FROM lead_generation_items WHERE run_id = @runId AND status = @status ORDER BY id"
    : "SELECT * FROM lead_generation_items WHERE run_id = @runId ORDER BY id";
  return all<Record<string, unknown>>(q, status ? { runId, status } : { runId });
}

export async function insertRunItemsSafe(
  runId: number,
  stations: Array<{ cnpj: string; station_json: object; anp_raw?: object }>
) {
  for (const s of stations) {
    const exists = await get<{ id: number }>(
      "SELECT id FROM lead_generation_items WHERE run_id = @runId AND cnpj = @cnpj LIMIT 1",
      { runId, cnpj: s.cnpj }
    );
    if (exists) continue;
    await run(
      `
        INSERT INTO lead_generation_items (run_id, cnpj, station_json, anp_raw, status, created_at, updated_at)
        VALUES (@runId, @cnpj, @station::jsonb, @anp::jsonb, 'pending', @now, @now)
      `,
      {
        runId,
        cnpj: s.cnpj,
        station: JSON.stringify(s.station_json),
        anp: JSON.stringify(s.anp_raw ?? s.station_json),
        now: nowIso()
      }
    );
  }
}

export async function countItemsByStatus(runId: number) {
  const rows = await all<{ status: string; c: string }>(
    `
      SELECT status, COUNT(*)::text AS c FROM lead_generation_items
      WHERE run_id = @runId GROUP BY status
    `,
    { runId }
  );
  const map: Record<string, number> = {};
  for (const r of rows) map[r.status] = Number(r.c);
  return map;
}

export async function fetchPendingItemIds(runId: number, limit: number) {
  return all<{ id: number }>(
    `
      SELECT id FROM lead_generation_items
      WHERE run_id = @runId AND status = 'pending'
      ORDER BY id
      LIMIT @limit
    `,
    { runId, limit }
  );
}

export async function getItem(id: number) {
  return get<Record<string, unknown>>("SELECT * FROM lead_generation_items WHERE id = @id", { id });
}

export async function updateItem(
  id: number,
  patch: Partial<{
    status: string;
    client_id: number | null;
    google_place_id: string | null;
    enrichment_json: object;
    error_message: string | null;
  }>
) {
  const sets = ["updated_at = @now"];
  const params: Record<string, string | number | null> = { id, now: nowIso() };
  if (patch.status) {
    sets.push("status = @status");
    params.status = patch.status;
  }
  if (patch.client_id !== undefined) {
    sets.push("client_id = @clientId");
    params.clientId = patch.client_id;
  }
  if (patch.google_place_id !== undefined) {
    sets.push("google_place_id = @placeId");
    params.placeId = patch.google_place_id;
  }
  if (patch.enrichment_json) {
    sets.push("enrichment_json = @enrich::jsonb");
    params.enrich = JSON.stringify(patch.enrichment_json);
  }
  if (patch.error_message !== undefined) {
    sets.push("error_message = @err");
    params.err = patch.error_message;
  }
  await run(`UPDATE lead_generation_items SET ${sets.join(", ")} WHERE id = @id`, params);
}

export async function getGoogleCache(cnpj: string) {
  return get<{ place_id: string | null; payload_json: unknown }>(
    "SELECT place_id, payload_json FROM lead_generation_google_cache WHERE cnpj = @cnpj",
    { cnpj }
  );
}

export async function upsertGoogleCache(cnpj: string, placeId: string | null, payload: object) {
  await run(
    `
      INSERT INTO lead_generation_google_cache (cnpj, place_id, payload_json, updated_at)
      VALUES (@cnpj, @placeId, @payload::jsonb, @now)
      ON CONFLICT (cnpj) DO UPDATE SET place_id = @placeId, payload_json = @payload::jsonb, updated_at = @now
    `,
    { cnpj, placeId, payload: JSON.stringify(payload), now: nowIso() }
  );
}
