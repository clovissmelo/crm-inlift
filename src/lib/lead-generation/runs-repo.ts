import { all, get, run, nowIso } from "@/lib/db";
import { normalizeSegmentFilter } from "@/lib/lead-motor/lead-gen-segments";
import { parseFlowSnapshot } from "@/lib/lead-generation/flows-repo";
import { syncDiscoveryCountsWhenItemsQueued } from "@/lib/lead-generation/run-discovery-meta";
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
  if (Array.isArray(o.municipalities)) {
    d.municipalities = o.municipalities
      .map((x) => {
        if (!x || typeof x !== "object") return null;
        const m = x as Record<string, unknown>;
        const ibge_code = Number(m.ibge_code);
        const name = String(m.name ?? "");
        if (!Number.isFinite(ibge_code) || !name) return null;
        return {
          ibge_code,
          name,
          commercial_zone_id: m.commercial_zone_id != null ? Number(m.commercial_zone_id) : null
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
  }
  if (Array.isArray(o.commercial_zone_ids)) {
    d.commercial_zone_ids = o.commercial_zone_ids.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  }
  if (Array.isArray(o.regions)) d.regions = o.regions.map(String);
  if (o.all_cities_in_uf === true || o.all_cities_in_uf === "true" || o.all_cities_in_uf === 1) {
    d.all_cities_in_uf = true;
  }
  if (typeof o.segment === "string") d.segment = o.segment.trim() || "all";
  if (typeof o.segment_filter_kind === "string") {
    d.segment_filter_kind = normalizeSegmentFilter(o.segment_filter_kind);
  }
  return d;
}

function mapRun(row: Record<string, unknown>): LeadGenerationRunRow {
  return {
    id: Number(row.id),
    requested_by_user_id: Number(row.requested_by_user_id),
    status: String(row.status),
    phase: String(row.phase),
    uf: String(row.uf),
    flow_id: row.flow_id != null ? Number(row.flow_id) : null,
    flow_snapshot_json: parseFlowSnapshot(row.flow_snapshot_json),
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
  cities_total?: number;
  flow_id?: number | null;
  flow_snapshot_json?: unknown;
}) {
  const counts = emptyCounts();
  if (input.cities_total != null && input.cities_total > 0) {
    counts.cities_total = input.cities_total;
  }
  const result = await run(
    `
      INSERT INTO lead_generation_runs (
        requested_by_user_id, status, phase, uf, filters_json,
        product_id, company_id, bdr_user_id, max_stations, max_google_calls,
        simulation, counts_json, progress_pct, flow_id, flow_snapshot_json, created_at, updated_at
      ) VALUES (
        @userId, 'queued', 'anp_load', @uf, @filters::jsonb,
        @productId, @companyId, @bdrUserId, @maxStations, @maxGoogle,
        @simulation, @counts::jsonb, 0, @flowId, @flowSnapshot::jsonb, @now, @now
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
      flowId: input.flow_id ?? null,
      flowSnapshot: input.flow_snapshot_json ? JSON.stringify(input.flow_snapshot_json) : null,
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

export async function touchRunActivity(id: number) {
  await run("UPDATE lead_generation_runs SET updated_at = @now WHERE id = @id", { id, now: nowIso() });
}

export async function updateRun(
  id: number,
  patch: Partial<{
    status: string;
    phase: string;
    counts_json: LeadGenCounts;
    filters_json: LeadGenFilters;
    progress_pct: number;
    google_calls_used: number;
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
  if (patch.filters_json) {
    sets.push("filters_json = @filters::jsonb");
    params.filters = JSON.stringify(patch.filters_json);
  }
  if (patch.progress_pct != null) {
    sets.push("progress_pct = @pct");
    params.pct = patch.progress_pct;
  }
  if (patch.google_calls_used != null) {
    sets.push("google_calls_used = @google_calls_used");
    params.google_calls_used = patch.google_calls_used;
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

export async function finalizeCancelledRun(id: number) {
  await run(
    `
      UPDATE lead_generation_runs
      SET status = 'cancelled', phase = 'done', cancel_requested = false, error_message = NULL,
          completed_at = @now, updated_at = @now, progress_pct = 100
      WHERE id = @id AND status IN ('queued', 'running', 'paused')
    `,
    { id, now: nowIso() }
  );
}

/** Cancela execução; pausada/fila finaliza na hora; em execução sinaliza e deixa o motor concluir. */
export async function cancelLeadGenerationRun(id: number): Promise<{ ok: true; drain: boolean } | { ok: false; error: string }> {
  const runRow = await getLeadGenerationRun(id);
  if (!runRow) return { ok: false, error: "Não encontrado" };
  if (runRow.status === "cancelled") return { ok: true, drain: false };
  if (!["queued", "running", "paused"].includes(runRow.status)) {
    return { ok: false, error: "Execução já finalizada." };
  }

  if (runRow.status === "running") {
    await requestCancelRun(id);
    return { ok: true, drain: true };
  }

  await finalizeCancelledRun(id);
  return { ok: true, drain: false };
}

export async function resumeRun(id: number) {
  await run(
    `
      UPDATE lead_generation_runs SET status = 'running', cancel_requested = false, error_message = NULL, updated_at = @now
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

/** Itens já processados, mais recentes primeiro (feed leve para polling). */
export async function listRunActivityFeed(runId: number, limit = 40) {
  const cap = Math.min(80, Math.max(1, limit));
  return all<Record<string, unknown>>(
    `
      SELECT id, cnpj, status, error_message, station_json, anp_raw, created_at, updated_at
      FROM lead_generation_items
      WHERE run_id = @runId AND status NOT IN ('pending', 'processing')
      ORDER BY updated_at DESC, id DESC
      LIMIT @limit
    `,
    { runId, limit: cap }
  );
}

export async function insertRunItemsSafe(
  runId: number,
  stations: Array<{
    cnpj: string;
    station_json: object;
    anp_raw?: object;
    google_place_id?: string | null;
  }>
) {
  for (const s of stations) {
    const rowKey = s.cnpj?.trim() || (s.google_place_id ? `gplace:${s.google_place_id}` : "");
    if (!rowKey) continue;
    const exists = await get<{ id: number }>(
      "SELECT id FROM lead_generation_items WHERE run_id = @runId AND cnpj = @cnpj LIMIT 1",
      { runId, cnpj: rowKey }
    );
    if (exists) continue;
    if (s.google_place_id) {
      const dupPlace = await get<{ id: number }>(
        "SELECT id FROM lead_generation_items WHERE run_id = @runId AND google_place_id = @placeId LIMIT 1",
        { runId, placeId: s.google_place_id }
      );
      if (dupPlace) continue;
    }
    await run(
      `
        INSERT INTO lead_generation_items (run_id, cnpj, station_json, anp_raw, google_place_id, status, created_at, updated_at)
        VALUES (@runId, @cnpj, @station::jsonb, @anp::jsonb, @placeId, 'pending', @now, @now)
      `,
      {
        runId,
        cnpj: rowKey,
        station: JSON.stringify(s.station_json),
        anp: JSON.stringify(s.anp_raw ?? s.station_json),
        placeId: s.google_place_id ?? null,
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

/** Recalcula contadores a partir dos itens (fonte de verdade após processamento). */
export async function recomputeRunCountsFromItems(runId: number): Promise<LeadGenCounts> {
  const run = await getLeadGenerationRun(runId);
  const counts = { ...(run?.counts_json ?? emptyCounts()) };
  const byStatus = await countItemsByStatus(runId);
  counts.items_total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  counts.processed =
    (byStatus.existing ?? 0) +
    (byStatus.created ?? 0) +
    (byStatus.ambiguous ?? 0) +
    (byStatus.no_google_match ?? 0) +
    (byStatus.error ?? 0) +
    (byStatus.skipped_invalid_cnpj ?? 0);
  counts.existing = byStatus.existing ?? 0;
  counts.created = byStatus.created ?? 0;
  counts.ambiguous = byStatus.ambiguous ?? 0;
  counts.no_google_match = byStatus.no_google_match ?? 0;
  counts.errors = byStatus.error ?? 0;
  counts.skipped_invalid_cnpj = byStatus.skipped_invalid_cnpj ?? 0;
  counts.pending = byStatus.pending ?? 0;
  counts.processing = byStatus.processing ?? 0;
  counts.anp_found = Math.max(counts.anp_found ?? 0, counts.items_total ?? 0);
  if (run) {
    const queue = (counts.pending ?? 0) + (counts.processing ?? 0);
    return syncDiscoveryCountsWhenItemsQueued(run, counts, queue);
  }
  return counts;
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

/** Pendentes + itens travados em `processing` (timeout de servidor). */
export async function fetchRunnableItemIds(
  runId: number,
  limit: number,
  staleAfterMs: number
) {
  const cutoff = new Date(Date.now() - staleAfterMs).toISOString();
  return all<{ id: number }>(
    `
      SELECT id FROM lead_generation_items
      WHERE run_id = @runId
        AND (
          status = 'pending'
          OR (status = 'processing' AND updated_at < @cutoff)
        )
      ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, id
      LIMIT @limit
    `,
    { runId, limit, cutoff }
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
