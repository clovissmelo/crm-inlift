import { ANP_CITIES_PER_TICK, ITEMS_PER_CRON_TICK } from "@/lib/lead-motor/motor-config";
import type { AnpStation } from "@/lib/lead-motor/anp";
import { fetchAnpMunicipality, filterStations, mapAnpRecord } from "@/lib/lead-motor/anp";
import { buildGoogleSearchQuery, findPlaceId, getPlaceDetails } from "@/lib/lead-motor/google-places";
import { validateGoogleMatch } from "@/lib/lead-motor/google-validate";
import { enrichFromReceita, mergeEnrichment } from "@/lib/lead-motor/enrichment";
import { isValidCnpjDigits } from "@/lib/lead-motor/utils";
import { resolveCityPairs, type CityPair } from "@/lib/lead-generation/city-resolve";
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
  let addedStations = 0;
  for (; idx < end; idx++) {
    const pair = pairs[idx]!;
    let rawRows: Record<string, unknown>[];
    try {
      rawRows = await fetchAnpMunicipality(pair.api, runRow.uf);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao consultar ANP";
      await updateRun(runId, {
        status: "failed",
        phase: "done",
        error_message: `ANP (${pair.official}): ${msg}`,
        counts_json: { ...counts, cities_loaded: idx },
        progress_pct: 100,
        completed_at: nowIso()
      });
      return;
    }
    const mapped: AnpStation[] = [];
    for (const row of rawRows) {
      const m = mapAnpRecord(row, pair.official, runRow.uf);
      if (m) mapped.push(m);
    }
    const filtered = filterStations(mapped, {
      city: runRow.filters_json.all_cities_in_uf ? null : pair.official,
      segment: runRow.filters_json.segment,
      limit: 0
    });
    await insertRunItemsSafe(
      runId,
      filtered.map((s) => ({ cnpj: s.cnpj, station_json: s, anp_raw: s }))
    );
    addedStations += filtered.length;
  }

  counts.cities_loaded = idx;
  counts.anp_found = (counts.anp_found ?? 0) + addedStations;
  const byStatus = await countItemsByStatus(runId);
  counts.items_total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const pending = byStatus.pending ?? 0;
  const pct = Math.min(15, Math.round((counts.cities_loaded / pairs.length) * 15));

  if (idx >= pairs.length) {
    await finishAnpLoadPhase(runId, counts);
    return;
  }

  const buffer = Math.max(15, runRow.max_stations * 8);
  if (pending >= buffer) {
    await updateRun(runId, { phase: "processing", counts_json: counts, progress_pct: Math.max(pct, 1) });
    return;
  }

  await updateRun(runId, { counts_json: counts, progress_pct: pct });
}

async function finishAnpLoadPhase(runId: number, counts: LeadGenCounts) {
  const items = await listRunItems(runId);
  counts.anp_found = items.length;
  counts.items_total = items.length;
  await updateRun(runId, {
    phase: "processing",
    counts_json: counts,
    progress_pct: items.length ? 1 : 99
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
    const pct = Math.min(99, Math.round((counts.created / freshRun.max_stations) * 100));
    await updateRun(runId, { counts_json: counts, progress_pct: pct, phase: "finalizing" });
    return;
  }

  const { counts, pct: itemPct } = await recomputeCounts(runId, freshRun);
  counts.google_matched = counts.created + counts.ambiguous;
  counts.enriched = counts.created;
  let pct = itemPct;
  if (freshRun.max_stations > 0) {
    pct = Math.min(99, Math.round((counts.created / freshRun.max_stations) * 100));
  }
  await updateRun(runId, { counts_json: counts, progress_pct: Math.max(pct, freshRun.progress_pct) });
}

async function tickFinalizing(runId: number) {
  const runRow = await getLeadGenerationRun(runId);
  if (!runRow) return;
  const { counts, pending, processing } = await recomputeCounts(runId, runRow);
  if (pending + processing > 0) {
    await updateRun(runId, { phase: "processing", counts_json: counts });
    return;
  }
  await updateRun(runId, {
    status: "completed",
    phase: "done",
    counts_json: counts,
    progress_pct: 100,
    completed_at: nowIso(),
    error_message: null
  });
}

export async function processLeadGenerationTick(
  preferredRunId?: number
): Promise<{ processedRunId: number | null; action: string }> {
  const { pickRunnableRunId, getLeadGenerationRun: getRun } = await import("@/lib/lead-generation/runs-repo");
  let runId = preferredRunId ?? null;
  if (runId != null) {
    const row = await getRun(runId);
    if (!row || !["queued", "running", "paused"].includes(row.status) || row.status === "paused") {
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

  let filtered = allStations;
  if (!input.filters.all_cities_in_uf && input.filters.cities.length === 1) {
    filtered = filterStations(allStations, {
      city: slice[0]?.official ?? null,
      segment: input.filters.segment,
      limit: 0
    });
  } else {
    filtered = filterStations(allStations, {
      city: null,
      segment: input.filters.segment,
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
