import { ANP_CITIES_PER_TICK, ITEMS_PER_CRON_TICK } from "@/lib/lead-motor/motor-config";
import type { AnpStation } from "@/lib/lead-motor/anp";
import { fetchAnpMunicipality, filterStations, mapAnpRecord } from "@/lib/lead-motor/anp";
import { buildGoogleSearchQuery, findPlaceId, getPlaceDetails } from "@/lib/lead-motor/google-places";
import { validateGoogleMatch } from "@/lib/lead-motor/google-validate";
import { enrichFromReceita, mergeEnrichment } from "@/lib/lead-motor/enrichment";
import { isValidCnpjDigits } from "@/lib/lead-motor/utils";
import { resolveCityPairs, type CityPair } from "@/lib/lead-generation/city-resolve";

const STALE_RUN_MS = 25 * 60 * 1000;

/** Corrige metadados de execuções antigas; pausa se ficou horas sem tick. */
async function syncRunProgressMetadata(
  runId: number,
  runRow: NonNullable<Awaited<ReturnType<typeof getLeadGenerationRun>>>
): Promise<{ paused: boolean }> {
  const pairs = resolveCityPairs(runRow.uf, runRow.filters_json);
  const counts = { ...runRow.counts_json };
  let dirty = false;
  if (pairs.length > 0 && (counts.cities_total ?? 0) !== pairs.length) {
    counts.cities_total = pairs.length;
    dirty = true;
  }

  const updatedMs = Date.parse(runRow.updated_at);
  const stale =
    runRow.status === "running" &&
    Number.isFinite(updatedMs) &&
    Date.now() - updatedMs > STALE_RUN_MS;

  if (stale) {
    await updateRun(runId, {
      status: "paused",
      error_message:
        "Execução ficou sem atividade (aba fechada ou timeout). Clique Retomar com esta página aberta ou cancele e inicie outra."
    });
    return { paused: true };
  }

  if (dirty) {
    await updateRun(runId, {
      counts_json: counts,
      progress_pct: computeRunProgressPct({
        phase: runRow.phase,
        status: runRow.status,
        max_stations: runRow.max_stations,
        counts_json: counts
      })
    });
  }
  return { paused: false };
}
import { canSpendGoogleCalls, touchRunGoogleUsage } from "@/lib/lead-generation/quota";
import {
  countItemsByStatus,
  fetchPendingItemIds,
  getGoogleCache,
  getItem,
  getLeadGenerationRun,
  insertRunItemsSafe,
  listRunItems,
  updateItem,
  updateRun,
  upsertGoogleCache
} from "@/lib/lead-generation/runs-repo";
import { computeRunProgressPct } from "@/lib/lead-generation/run-progress";
import type { LeadGenCounts } from "@/lib/lead-generation/types";
import { createClientFromLead, findExistingClientIdByCnpj } from "@/lib/lead-motor/persist-client";
import { getGooglePlacesApiKey } from "@/lib/google-places-settings";
import { run, nowIso } from "@/lib/db";

function parseStation(raw: unknown): AnpStation | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as AnpStation;
}

async function recomputeCounts(runId: number, runRow: { counts_json: LeadGenCounts; max_stations: number }) {
  const byStatus = await countItemsByStatus(runId);
  const counts = { ...runRow.counts_json };
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
  const pending = byStatus.pending ?? 0;
  const processing = byStatus.processing ?? 0;
  let pct = 0;
  if (counts.items_total > 0) {
    const done = counts.items_total - pending - processing;
    pct = Math.min(99, Math.round((done / counts.items_total) * 100));
  }
  return { counts, pct, pending, processing };
}

/** Meta atingida: descarta fila pendente (itens já processados não são reconsultados). */
async function dropRemainingPending(runId: number) {
  await run("DELETE FROM lead_generation_items WHERE run_id = @runId AND status = 'pending'", { runId });
}

async function createdCountForRun(runId: number) {
  const byStatus = await countItemsByStatus(runId);
  return byStatus.created ?? 0;
}

async function targetCreatedReached(runId: number, maxStations: number) {
  if (maxStations <= 0) return false;
  return (await createdCountForRun(runId)) >= maxStations;
}

async function tickAnpLoad(runId: number) {
  const runRow = await getLeadGenerationRun(runId);
  if (!runRow) return;
  const pairs = resolveCityPairs(runRow.uf, runRow.filters_json);
  const counts = { ...runRow.counts_json };
  counts.cities_total = pairs.length;
  if ((runRow.counts_json?.cities_total ?? 0) !== pairs.length) {
    const progress_pct = computeRunProgressPct({
      phase: runRow.phase,
      status: runRow.status,
      max_stations: runRow.max_stations,
      counts_json: { ...counts, cities_loaded: counts.cities_loaded ?? 0 }
    });
    await updateRun(runId, {
      counts_json: { ...counts, cities_loaded: counts.cities_loaded ?? 0 },
      progress_pct
    });
  }
  if (pairs.length === 0) {
    const hint = runRow.filters_json.all_cities_in_uf
      ? `UF ${runRow.uf} sem cidades no mapa ANP.`
      : "Nenhuma cidade válida na seleção salva. Marque “Todas mapeadas”, zonas ou cidades e inicie de novo.";
    await updateRun(runId, {
      status: "failed",
      phase: "done",
      error_message: hint,
      counts_json: counts,
      progress_pct: 100,
      completed_at: nowIso()
    });
    return;
  }

  let idx = counts.cities_loaded ?? 0;
  if (idx >= pairs.length) {
    await finishAnpLoadPhase(runId, counts);
    return;
  }

  const end = Math.min(idx + ANP_CITIES_PER_TICK, pairs.length);
  for (; idx < end; idx++) {
    const pair = pairs[idx]!;
    let rawRows: Record<string, unknown>[];
    try {
      rawRows = await fetchAnpMunicipality(pair.api, runRow.uf);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao consultar ANP";
      counts.cities_loaded = idx + 1;
      await updateRun(runId, {
        counts_json: counts,
        progress_pct: computeRunProgressPct({
          phase: runRow.phase,
          status: runRow.status,
          max_stations: runRow.max_stations,
          counts_json: counts
        }),
        error_message: `ANP (${pair.official}): ${msg} — pulando cidade.`
      });
      continue;
    }
    const mapped: AnpStation[] = [];
    for (const row of rawRows) {
      const m = mapAnpRecord(row, pair.official, runRow.uf);
      if (m) mapped.push(m);
    }
    const filtered = filterStations(mapped, {
      city: runRow.filters_json.all_cities_in_uf ? null : pair.official,
      segment:
        runRow.filters_json.segment_filter_kind ??
        (runRow.filters_json.segment as import("@/lib/lead-motor/lead-gen-segments").LeadGenSegmentFilter),
      limit: 0
    });
    await insertRunItemsSafe(
      runId,
      filtered.map((s) => ({ cnpj: s.cnpj, station_json: s, anp_raw: s }))
    );
    counts.cities_loaded = idx + 1;
    counts.anp_found = (counts.anp_found ?? 0) + filtered.length;
    const byStatusMid = await countItemsByStatus(runId);
    counts.items_total = Object.values(byStatusMid).reduce((a, b) => a + b, 0);
    await updateRun(runId, {
      counts_json: counts,
      progress_pct: computeRunProgressPct({
        phase: runRow.phase,
        status: runRow.status,
        max_stations: runRow.max_stations,
        counts_json: counts
      })
    });
  }

  counts.cities_loaded = idx;
  const byStatus = await countItemsByStatus(runId);
  counts.items_total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const pending = byStatus.pending ?? 0;
  const progress_pct = computeRunProgressPct({
    phase: runRow.phase,
    status: runRow.status,
    max_stations: runRow.max_stations,
    counts_json: counts
  });

  if (idx >= pairs.length) {
    await finishAnpLoadPhase(runId, counts);
    return;
  }

  const buffer = Math.max(15, runRow.max_stations * 8);
  if (pending >= buffer) {
    await updateRun(runId, {
      phase: "processing",
      counts_json: counts,
      progress_pct: computeRunProgressPct({
        phase: "processing",
        status: runRow.status,
        max_stations: runRow.max_stations,
        counts_json: counts
      })
    });
    return;
  }

  await updateRun(runId, { counts_json: counts, progress_pct });
}

async function finishAnpLoadPhase(runId: number, counts: LeadGenCounts) {
  const items = await listRunItems(runId);
  counts.anp_found = items.length;
  counts.items_total = items.length;
  const runRow = await getLeadGenerationRun(runId);
  await updateRun(runId, {
    phase: "processing",
    counts_json: counts,
    progress_pct: computeRunProgressPct({
      phase: "processing",
      status: runRow?.status,
      max_stations: runRow?.max_stations ?? 1,
      counts_json: counts
    })
  });
}

async function processOneItem(
  runId: number,
  itemId: number,
  runRow: NonNullable<Awaited<ReturnType<typeof getLeadGenerationRun>>>
) {
  const item = await getItem(itemId);
  if (!item || String(item.status) !== "pending") return;

  await updateItem(itemId, { status: "processing" });
  const station = parseStation(item.station_json);
  const cnpj = String(item.cnpj ?? "");

  if (!station || !isValidCnpjDigits(cnpj)) {
    await updateItem(itemId, { status: "skipped_invalid_cnpj", error_message: "CNPJ inválido ou ausente" });
    return;
  }

  const existingId = await findExistingClientIdByCnpj(cnpj);
  if (existingId) {
    await updateItem(itemId, { status: "existing", client_id: existingId });
    return;
  }

  const apiKey = runRow.simulation ? null : await getGooglePlacesApiKey();
  let googleSnap: {
    place_id: string;
    phone_digits: string;
    phone_display: string;
    website: string;
    name: string;
    formatted_address: string;
  } | null = null;

  if (!runRow.simulation && !apiKey) {
    /* ANP + Receita apenas — enriquecimento Google indisponível sem chave. */
  } else if (!runRow.simulation && apiKey) {
    const cache = await getGoogleCache(cnpj);
    if (cache?.payload_json && typeof cache.payload_json === "object") {
      const p = cache.payload_json as Record<string, unknown>;
      if (p.phone_digits || p.place_id) {
        googleSnap = {
          place_id: String(cache.place_id ?? p.place_id ?? ""),
          phone_digits: String(p.phone_digits ?? ""),
          phone_display: String(p.phone_display ?? ""),
          website: String(p.website ?? ""),
          name: String(p.name ?? ""),
          formatted_address: String(p.formatted_address ?? "")
        };
      }
    }

    if (!googleSnap) {
      const needCalls = 2;
      const ok = await canSpendGoogleCalls(runRow.google_calls_used, runRow.max_google_calls, needCalls);
      if (!ok) {
        await updateItem(itemId, { status: "pending" });
        await updateRun(runId, { status: "paused", error_message: "Limite diário ou por execução de Google atingido." });
        return;
      }

      const query = buildGoogleSearchQuery(station);
      const found = await findPlaceId(apiKey, query, station);
      await touchRunGoogleUsage(runId, 1);
      runRow.google_calls_used += 1;

      if (!found) {
        await updateItem(itemId, { status: "no_google_match" });
        return;
      }

      const match = validateGoogleMatch(station, found.name, found.formatted_address);
      if (match === "rejected") {
        await updateItem(itemId, { status: "no_google_match", error_message: "Correspondência Google rejeitada" });
        return;
      }
      if (match === "ambiguous") {
        await updateItem(itemId, {
          status: "ambiguous",
          google_place_id: found.place_id,
          error_message: "Correspondência Google incerta — revisão manual"
        });
        return;
      }

      const ok2 = await canSpendGoogleCalls(runRow.google_calls_used, runRow.max_google_calls, 1);
      if (!ok2) {
        await updateItem(itemId, { status: "pending" });
        await updateRun(runId, { status: "paused", error_message: "Limite Google atingido após Find Place." });
        return;
      }

      const details = await getPlaceDetails(apiKey, found.place_id);
      await touchRunGoogleUsage(runId, 1);
      runRow.google_calls_used += 1;

      if (details) {
        googleSnap = {
          place_id: details.place_id,
          phone_digits: details.phone_digits,
          phone_display: details.phone_display,
          website: details.website,
          name: details.name,
          formatted_address: details.formatted_address
        };
        await upsertGoogleCache(cnpj, details.place_id, {
          ...details,
          collected_at: nowIso(),
          source: "Google Places"
        });
      }
    }
  }

  let receita: Awaited<ReturnType<typeof enrichFromReceita>> = {};
  try {
    receita = await enrichFromReceita(cnpj, runRow.simulation);
  } catch {
    receita = {};
  }

  const enrichment = mergeEnrichment(station, receita, googleSnap);
  enrichment.sources.push(`Coletado em ${nowIso()}`);

  try {
    const clientId = await createClientFromLead({
      station,
      enrichment,
      bdr_user_id: runRow.bdr_user_id,
      product_id: runRow.product_id,
      run_id: runId,
      google_place_id: googleSnap?.place_id ?? null
    });
    await updateItem(itemId, {
      status: "created",
      client_id: clientId,
      google_place_id: googleSnap?.place_id ?? null,
      enrichment_json: { ...enrichment, google: googleSnap }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao criar cliente";
    if (/cnpj|duplicate|unique/i.test(msg)) {
      const again = await findExistingClientIdByCnpj(cnpj);
      await updateItem(itemId, {
        status: "existing",
        client_id: again,
        error_message: "CNPJ já existia ao gravar"
      });
    } else {
      await updateItem(itemId, { status: "error", error_message: msg });
    }
  }
}

async function tickProcessing(runId: number) {
  const runRow = await getLeadGenerationRun(runId);
  if (!runRow) return;

  if (await targetCreatedReached(runId, runRow.max_stations)) {
    await dropRemainingPending(runId);
    await updateRun(runId, { phase: "finalizing" });
    return;
  }

  const ids = await fetchPendingItemIds(runId, ITEMS_PER_CRON_TICK);
  if (ids.length === 0) {
    const { counts } = await recomputeCounts(runId, runRow);
    const citiesDone = (counts.cities_loaded ?? 0) >= (counts.cities_total ?? 0);
    const targetPending =
      runRow.max_stations > 0 && (counts.created ?? 0) < runRow.max_stations && !citiesDone;
    if (targetPending) {
      await updateRun(runId, { phase: "anp_load", counts_json: counts });
      return;
    }
    await updateRun(runId, { phase: "finalizing", counts_json: counts });
    return;
  }

  for (const { id } of ids) {
    const fresh = await getLeadGenerationRun(runId);
    if (!fresh || fresh.cancel_requested) break;
    if (await targetCreatedReached(runId, fresh.max_stations)) break;
    await processOneItem(runId, id, fresh);
    if (await targetCreatedReached(runId, fresh.max_stations)) break;
  }

  const freshRun = await getLeadGenerationRun(runId);
  if (!freshRun) return;

  if (await targetCreatedReached(runId, freshRun.max_stations)) {
    await dropRemainingPending(runId);
    const { counts } = await recomputeCounts(runId, freshRun);
    counts.google_matched = counts.created + counts.ambiguous;
    counts.enriched = counts.created;
    const progress_pct = computeRunProgressPct({
      phase: "finalizing",
      status: freshRun.status,
      max_stations: freshRun.max_stations,
      counts_json: counts
    });
    await updateRun(runId, { counts_json: counts, progress_pct, phase: "finalizing" });
    return;
  }

  const { counts } = await recomputeCounts(runId, freshRun);
  counts.google_matched = counts.created + counts.ambiguous;
  counts.enriched = counts.created;
  const progress_pct = Math.max(
    freshRun.progress_pct,
    computeRunProgressPct({
      phase: freshRun.phase,
      status: freshRun.status,
      max_stations: freshRun.max_stations,
      counts_json: counts
    })
  );
  await updateRun(runId, { counts_json: counts, progress_pct });
}

async function tickFinalizing(runId: number) {
  const runRow = await getLeadGenerationRun(runId);
  if (!runRow) return;
  const { counts, pending, processing } = await recomputeCounts(runId, runRow);
  if (pending + processing > 0) {
    await updateRun(runId, { phase: "processing", counts_json: counts });
    return;
  }
  const created = counts.created ?? 0;
  const target = runRow.max_stations;
  let status: "completed" | "partial" = "completed";
  if (target > 0 && created < target && (counts.processed ?? 0) > 0) {
    status = "partial";
  }
  if ((counts.errors ?? 0) > 0 && created === 0) {
    status = "partial";
  }

  await updateRun(runId, {
    status,
    phase: "done",
    counts_json: counts,
    progress_pct: 100,
    completed_at: nowIso(),
    error_message: status === "partial" && created < target ? `Meta: ${created}/${target} novos cadastrados.` : null
  });
}

export async function processLeadGenerationTick(
  preferredRunId?: number
): Promise<{ processedRunId: number | null; action: string }> {
  const { pickRunnableRunId, getLeadGenerationRun: getRun } = await import("@/lib/lead-generation/runs-repo");
  let runId = preferredRunId ?? null;
  if (runId != null) {
    const row = await getRun(runId);
    if (!row || !["queued", "running", "paused"].includes(row.status)) {
      runId = null;
    }
  }
  if (runId == null) runId = await pickRunnableRunId();
  if (!runId) return { processedRunId: null, action: "idle" };

  let runRow = await getLeadGenerationRun(runId);
  if (!runRow) return { processedRunId: null, action: "idle" };

  if (runRow.cancel_requested) {
    await updateRun(runId, { status: "cancelled", phase: "done", completed_at: nowIso() });
    return { processedRunId: runId, action: "cancelled" };
  }

  const meta = await syncRunProgressMetadata(runId, runRow);
  if (meta.paused) {
    return { processedRunId: runId, action: "stale_paused" };
  }
  runRow = (await getLeadGenerationRun(runId))!;

  if (runRow.status === "queued") {
    await updateRun(runId, { status: "running", started_at: nowIso() });
    runRow = (await getLeadGenerationRun(runId))!;
  }

  if (runRow.status === "paused") {
    return { processedRunId: runId, action: "paused" };
  }

  if (runRow.phase === "anp_load") {
    await tickAnpLoad(runId);
    return { processedRunId: runId, action: "anp_load" };
  }
  if (runRow.phase === "processing") {
    await tickProcessing(runId);
    return { processedRunId: runId, action: "processing" };
  }
  if (runRow.phase === "finalizing") {
    await tickFinalizing(runId);
    return { processedRunId: runId, action: "finalizing" };
  }

  return { processedRunId: runId, action: "noop" };
}

/** Prévia síncrona (sem gravar execução) — limitada a poucas cidades por request. */
export async function previewLeadSelection(input: {
  uf: string;
  filters: import("@/lib/lead-generation/types").LeadGenFilters;
  max_stations: number;
  max_cities?: number;
}): Promise<{
  stations: AnpStation[];
  city_pairs: CityPair[];
  cities_scanned: number;
  cities_total: number;
  existing_in_crm: number;
  complete: boolean;
}> {
  const pairs = resolveCityPairs(input.uf, input.filters);
  const maxCities = input.max_cities ?? pairs.length;
  const slice = pairs.slice(0, maxCities);
  const allStations: AnpStation[] = [];

  for (const pair of slice) {
    const rawRows = await fetchAnpMunicipality(pair.api, input.uf);
    for (const row of rawRows) {
      const m = mapAnpRecord(row, pair.official, input.uf);
      if (m) allStations.push(m);
    }
  }

  const { resolveSegmentFilterKind } = await import("@/lib/lead-generation/segments-repo");
  const { normalizeSegmentFilter } = await import("@/lib/lead-motor/lead-gen-segments");
  const segmentFilter =
    input.filters.segment_filter_kind ??
    normalizeSegmentFilter(await resolveSegmentFilterKind(input.filters.segment));

  let filtered = allStations;
  if (!input.filters.all_cities_in_uf && input.filters.cities.length === 1) {
    filtered = filterStations(allStations, {
      city: slice[0]?.official ?? null,
      segment: segmentFilter,
      limit: 0
    });
  } else {
    filtered = filterStations(allStations, {
      city: null,
      segment: segmentFilter,
      limit: 0
    });
  }
  if (input.max_stations > 0) filtered = filtered.slice(0, input.max_stations);

  const cnpjs = [...new Set(filtered.map((s) => s.cnpj))];
  const { countExistingCnpjsInCrm } = await import("@/lib/lead-motor/persist-client");
  const existing_in_crm = await countExistingCnpjsInCrm(cnpjs);

  return {
    stations: filtered,
    city_pairs: pairs,
    cities_scanned: slice.length,
    cities_total: pairs.length,
    existing_in_crm,
    complete: slice.length >= pairs.length
  };
}
