import {
  ANP_CITIES_PER_TICK,
  enrichmentQueueBuffer,
  ITEM_PROCESSING_STALE_MS,
  ITEMS_PER_CRON_TICK
} from "@/lib/lead-motor/motor-config";
import { repairDiscoveryCounts } from "@/lib/lead-generation/run-discovery-meta";
import { appendMotorLog } from "@/lib/lead-generation/run-motor-log";
import type { AnpStation } from "@/lib/lead-motor/anp";
import { fetchAnpMunicipality, filterStations, mapAnpRecord } from "@/lib/lead-motor/anp";
import { buildGoogleSearchQuery, findPlaceId, getPlaceDetails } from "@/lib/lead-motor/google-places";
import { validateGoogleMatch } from "@/lib/lead-motor/google-validate";
import { enrichFromReceita, mergeEnrichment } from "@/lib/lead-motor/enrichment";
import { isValidCnpjDigits } from "@/lib/lead-motor/utils";
import { cityPairsForInitialSource } from "@/lib/lead-generation/discovery-cities";
import { resolveCityPairs, type CityPair } from "@/lib/lead-generation/city-resolve";
import type { FlowInitialSource } from "@/lib/lead-generation/flow-modules";
import { appendStepLog, onFailPolicy, stepEnabled, type StepRunResult } from "@/lib/lead-generation/item-enrichment-runner";
import { fetchAnpDistributorsForUf, distributorToStation } from "@/lib/lead-motor/anp-distributors";
import {
  buildSegmentPlacesQuery,
  discoverPlacesInCity,
  placeRowToStation
} from "@/lib/lead-motor/google-city-discover";
import {
  buildAnpEmptyRunError,
  buildPartialRunLog,
  buildStuckRunError,
  shouldFailNoSuccess
} from "@/lib/lead-generation/run-outcome";
import { isGeoExpansionExhausted, tryExpandRunGeography } from "@/lib/lead-generation/run-geo-expand";
import {
  canAttemptGoogleApi,
  recordGoogleApiAttempt,
  recordGoogleSuccessResult
} from "@/lib/lead-generation/quota";
import {
  countItemsByStatus,
  fetchRunnableItemIds,
  getGoogleCache,
  getItem,
  getLeadGenerationRun,
  insertRunItemsSafe,
  listRunItems,
  updateItem,
  updateRun,
  upsertGoogleCache
} from "@/lib/lead-generation/runs-repo";
import { anpLoadComplete, computeRunProgressPct } from "@/lib/lead-generation/run-progress";
import { emptyCounts, type LeadGenCounts } from "@/lib/lead-generation/types";
import { createClientFromLead, findExistingClientIdByCnpj } from "@/lib/lead-motor/persist-client";
import { getGooglePlacesApiKey } from "@/lib/google-places-settings";
import { run, nowIso } from "@/lib/db";

const STALE_RUN_MS = 25 * 60 * 1000;
const NO_PROGRESS_TICK_FAIL = 35;

async function pauseRunForGoogleLimit(
  runId: number,
  counts: LeadGenCounts,
  error_message: string,
  itemId?: number
) {
  if (itemId != null) await updateItem(itemId, { status: "pending" });
  await updateRun(runId, { status: "paused", counts_json: counts, error_message });
}

async function registerGoogleApiAttempt(
  runId: number,
  counts: LeadGenCounts
): Promise<LeadGenCounts> {
  await recordGoogleApiAttempt(runId);
  const next = { ...counts, google_api_attempts: (counts.google_api_attempts ?? 0) + 1 };
  await updateRun(runId, { counts_json: next });
  return next;
}

function bumpProgressTracking(counts: LeadGenCounts, phase: string): LeadGenCounts {
  if (phase === "anp_load" || phase === "queued") {
    return { ...counts, no_progress_ticks: 0 };
  }
  const created = counts.created ?? 0;
  const processed = counts.processed ?? 0;
  const lastC = counts.last_created_count ?? 0;
  const lastP = counts.last_processed_count ?? 0;
  if (created > lastC || processed > lastP) {
    return { ...counts, last_created_count: created, last_processed_count: processed, no_progress_ticks: 0 };
  }
  return { ...counts, no_progress_ticks: (counts.no_progress_ticks ?? 0) + 1 };
}

/** Corrige metadados de execuções antigas; pausa se ficou horas sem tick. */
async function syncRunProgressMetadata(
  runId: number,
  runRow: NonNullable<Awaited<ReturnType<typeof getLeadGenerationRun>>>
): Promise<{ paused: boolean }> {
  const pairs = cityPairsForInitialSource(runInitialSource(runRow), runRow.uf, runRow.filters_json);
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
    if (runRow.phase === "finalizing") {
      return { paused: false };
    }
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

function parseStation(raw: unknown): AnpStation | null {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      raw = JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object") return null;
  return raw as AnpStation;
}

function parseStationFromItem(item: Record<string, unknown>): AnpStation | null {
  const fromJson = parseStation(item.station_json) ?? parseStation(item.anp_raw);
  if (fromJson) return fromJson;
  const cnpjDigits = String(item.cnpj ?? "").replace(/\D/g, "");
  if (!isValidCnpjDigits(cnpjDigits)) return null;
  const raw = item.anp_raw ?? item.station_json;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (o.razao_social || o.cidade || o.endereco) {
      return {
        cnpj: cnpjDigits,
        razao_social: String(o.razao_social ?? ""),
        nome_fantasia: String(o.nome_fantasia ?? ""),
        bandeira: String(o.bandeira ?? ""),
        bandeira_branca: Boolean(o.bandeira_branca),
        endereco: String(o.endereco ?? o.logradouro ?? ""),
        logradouro: String(o.logradouro ?? ""),
        numero: String(o.numero ?? ""),
        bairro: String(o.bairro ?? ""),
        cidade: String(o.cidade ?? ""),
        uf: String(o.uf ?? ""),
        cep: String(o.cep ?? ""),
        autorizacao_anp: String(o.autorizacao_anp ?? o.autorizacao ?? ""),
        situacao_anp: String(o.situacao_anp ?? ""),
        distribuidora: String(o.distribuidora ?? ""),
        produtos_anp: String(o.produtos_anp ?? ""),
        latitude: String(o.latitude ?? ""),
        longitude: String(o.longitude ?? ""),
        anp_segment: "retail"
      };
    }
  }
  return null;
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
  counts.pending = pending;
  counts.processing = processing;
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

function runInitialSource(runRow: NonNullable<Awaited<ReturnType<typeof getLeadGenerationRun>>>): FlowInitialSource {
  return runRow.flow_snapshot_json?.initial_source ?? "anp_retail";
}

async function tickAnpDistributorLoad(
  runId: number,
  runRow: NonNullable<Awaited<ReturnType<typeof getLeadGenerationRun>>>
) {
  const counts = { ...runRow.counts_json };
  const pairs = cityPairsForInitialSource("anp_distributor", runRow.uf, runRow.filters_json);
  counts.cities_total = Math.max(1, pairs.length);
  if (counts.distributor_loaded) {
    await finishAnpLoadPhase(runId, counts);
    return;
  }
  const citySet = new Set(pairs.map((p) => p.official.toLowerCase()));
  const { records, warning } = await fetchAnpDistributorsForUf(runRow.uf);
  const filtered = records.filter((r) => {
    if (citySet.size === 0) return true;
    return citySet.has(r.cidade.toLowerCase());
  });
  const stations = filtered.map(distributorToStation);
  await insertRunItemsSafe(
    runId,
    stations.map((s) => ({ cnpj: s.cnpj, station_json: s, anp_raw: s }))
  );
  counts.distributor_loaded = 1;
  counts.cities_loaded = counts.cities_total;
  counts.anp_found = stations.length;
  const byStatus = await countItemsByStatus(runId);
  counts.items_total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  await updateRun(runId, {
    counts_json: counts,
    error_message: warning,
    progress_pct: computeRunProgressPct({
      phase: runRow.phase,
      status: runRow.status,
      max_stations: runRow.max_stations,
      counts_json: counts
    })
  });
  await finishAnpLoadPhase(runId, counts);
}

async function tryAdvanceToProcessingIfQueueReady(
  runId: number,
  runRow: NonNullable<Awaited<ReturnType<typeof getLeadGenerationRun>>>
): Promise<boolean> {
  if (runRow.phase !== "anp_load") return false;
  const byStatus = await countItemsByStatus(runId);
  const queue = (byStatus.pending ?? 0) + (byStatus.processing ?? 0);
  const buffer = enrichmentQueueBuffer(runRow.max_stations);
  if (queue < buffer) return false;

  let { counts } = await recomputeCounts(runId, runRow);
  counts = repairDiscoveryCounts(runRow, counts);
  counts = appendMotorLog(
    counts,
    `Fila ${queue} posto(s) (buffer ${buffer}) → enriquecimento imediato`
  );
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
  await tickProcessing(runId);
  return true;
}

async function tickGooglePlacesCityLoad(
  runId: number,
  runRow: NonNullable<Awaited<ReturnType<typeof getLeadGenerationRun>>>
) {
  if (await tryAdvanceToProcessingIfQueueReady(runId, runRow)) return;

  let counts = repairDiscoveryCounts(runRow, { ...runRow.counts_json });
  const pairs = cityPairsForInitialSource("google_places_city", runRow.uf, runRow.filters_json);
  counts.cities_total = pairs.length;
  counts = appendMotorLog(counts, `Google cidade: ${pairs.length} municípios na fila ANP`);
  await updateRun(runId, {
    counts_json: counts,
    progress_pct: computeRunProgressPct({
      phase: runRow.phase,
      status: runRow.status,
      max_stations: runRow.max_stations,
      counts_json: counts
    })
  });
  if (pairs.length === 0) {
    await updateRun(runId, {
      status: "failed",
      phase: "done",
      error_message: "Nenhuma cidade na seleção para busca Google.",
      completed_at: nowIso(),
      progress_pct: 100
    });
    return;
  }
  if (runRow.simulation) {
    await updateRun(runId, {
      status: "failed",
      phase: "done",
      error_message: "Fluxo Tradicional não roda em simulação (sem chave Google).",
      completed_at: nowIso(),
      progress_pct: 100
    });
    return;
  }
  const apiKey = await getGooglePlacesApiKey();
  if (!apiKey) {
    await updateRun(runId, {
      status: "failed",
      phase: "done",
      error_message: "Google Places não configurado.",
      completed_at: nowIso(),
      progress_pct: 100
    });
    return;
  }

  const stepCfg = runRow.flow_snapshot_json?.steps.find((s) => s.step_key === "google_places_city_discover");
  if (stepCfg && !stepCfg.enabled) {
    await updateRun(runId, {
      status: "failed",
      phase: "done",
      error_message: "Etapa de descoberta Google desativada no fluxo.",
      completed_at: nowIso(),
      progress_pct: 100
    });
    return;
  }
  const maxPerCity = stepCfg?.max_api_calls ?? 8;

  const { listLeadGenSegments } = await import("@/lib/lead-generation/segments-repo");
  const segments = await listLeadGenSegments();
  const segLabel = segments.find((s) => s.slug === runRow.filters_json.segment)?.label ?? runRow.filters_json.segment;

  let idx = counts.cities_loaded ?? 0;
  if (idx >= pairs.length) {
    await finishAnpLoadPhase(runId, counts);
    return;
  }

  const end = Math.min(idx + ANP_CITIES_PER_TICK, pairs.length);
  for (; idx < end; idx++) {
    const pair = pairs[idx]!;
    const gate = await canAttemptGoogleApi(counts.google_api_attempts ?? 0);
    if (!gate.ok) {
      await pauseRunForGoogleLimit(runId, counts, gate.error_message);
      return;
    }
    const query = buildSegmentPlacesQuery(segLabel, pair.official, runRow.uf);
    const places = await discoverPlacesInCity(apiKey, query, maxPerCity);
    counts = await registerGoogleApiAttempt(runId, counts);

    await insertRunItemsSafe(
      runId,
      places.map((p) => {
        const station = placeRowToStation({
          place_id: p.place_id,
          name: p.name,
          formatted_address: p.formatted_address,
          city: pair.official,
          uf: runRow.uf
        });
        return {
          cnpj: "",
          station_json: { ...station, discover_source: "google_places_city" },
          anp_raw: station,
          google_place_id: p.place_id
        };
      })
    );
    counts.cities_loaded = idx + 1;
    counts.anp_found = (counts.anp_found ?? 0) + places.length;
    const byStatusMid = await countItemsByStatus(runId);
    counts.items_total = Object.values(byStatusMid).reduce((a, b) => a + b, 0);
    counts = appendMotorLog(
      counts,
      `${pair.official}: +${places.length} lugar(es) · fila ${counts.items_total}`
    );
    await updateRun(runId, {
      counts_json: counts,
      progress_pct: computeRunProgressPct({
        phase: runRow.phase,
        status: runRow.status,
        max_stations: runRow.max_stations,
        counts_json: counts
      })
    });

    const pendingMid = byStatusMid.pending ?? 0;
    if (pendingMid >= enrichmentQueueBuffer(runRow.max_stations)) {
      await updateRun(runId, {
        phase: "processing",
        counts_json: appendMotorLog(counts, "Meta atingida na fila → enriquecimento"),
        progress_pct: computeRunProgressPct({
          phase: "processing",
          status: runRow.status,
          max_stations: runRow.max_stations,
          counts_json: counts
        })
      });
      await tickProcessing(runId);
      return;
    }
  }

  counts.cities_loaded = idx;
  const byStatus = await countItemsByStatus(runId);
  counts.items_total = Object.values(byStatus).reduce((a, b) => a + b, 0);
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

  const pending = byStatus.pending ?? 0;
  if (pending >= enrichmentQueueBuffer(runRow.max_stations)) {
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
    await tickProcessing(runId);
    return;
  }

  await updateRun(runId, { counts_json: counts, progress_pct });
}

/** Fase anp_load com postos já na fila — evita ficar em “enfileirando…” sem tick. */
async function closeAnpLoadWhenQueueReady(
  runId: number,
  runRow: NonNullable<Awaited<ReturnType<typeof getLeadGenerationRun>>>
): Promise<boolean> {
  if (runRow.phase !== "anp_load") return false;
  const byStatus = await countItemsByStatus(runId);
  const queue = (byStatus.pending ?? 0) + (byStatus.processing ?? 0);
  if (queue === 0) return false;

  const src = runInitialSource(runRow);
  const sourceKey = src === "google_places_city" ? "google_places_city" : "anp_retail";
  const pairs = cityPairsForInitialSource(sourceKey, runRow.uf, runRow.filters_json);
  let counts = repairDiscoveryCounts(runRow, { ...runRow.counts_json });
  if (pairs.length > 0) counts.cities_total = pairs.length;
  counts.items_total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  if (pairs.length > 0 && (counts.cities_loaded ?? 0) < pairs.length) {
    counts.cities_loaded = pairs.length;
  }
  counts = appendMotorLog(counts, `Fila com ${queue} posto(s): anp_load → enriquecimento`);
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
  await tickProcessing(runId);
  return true;
}

async function tickAnpLoad(runId: number) {
  const runRow = await getLeadGenerationRun(runId);
  if (!runRow) return;
  if (await tryAdvanceToProcessingIfQueueReady(runId, runRow)) return;
  if (await closeAnpLoadWhenQueueReady(runId, runRow)) return;

  const src = runInitialSource(runRow);
  if (src === "anp_distributor") {
    await tickAnpDistributorLoad(runId, runRow);
    return;
  }
  if (src === "google_places_city") {
    await tickGooglePlacesCityLoad(runId, runRow);
    return;
  }
  const pairs = cityPairsForInitialSource("anp_retail", runRow.uf, runRow.filters_json);
  let counts = repairDiscoveryCounts(runRow, { ...runRow.counts_json });
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
    await tickProcessing(runId);
    return;
  }

  const end = Math.min(idx + ANP_CITIES_PER_TICK, pairs.length);
  for (; idx < end; idx++) {
    const pair = pairs[idx]!;
    counts.last_anp_city = pair.official;
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
    await tickProcessing(runId);
    return;
  }

  if (pending >= enrichmentQueueBuffer(runRow.max_stations)) {
    counts = appendMotorLog(counts, `ANP: ${pending} pendente(s) → enriquecimento`);
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
    await tickProcessing(runId);
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
  if (!item) return;
  const itemStatus = String(item.status);
  if (itemStatus !== "pending" && itemStatus !== "processing") return;

  if (itemStatus === "pending") {
    await updateItem(itemId, { status: "processing" });
  }

  try {
    await processOneItemBody(runId, itemId, runRow, item);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro inesperado ao processar posto";
    const cur = await getItem(itemId);
    if (cur && String(cur.status) === "processing") {
      await updateItem(itemId, { status: "error", error_message: msg });
    }
  }
}

async function processOneItemBody(
  runId: number,
  itemId: number,
  runRow: NonNullable<Awaited<ReturnType<typeof getLeadGenerationRun>>>,
  item: Record<string, unknown>
) {
  const station = parseStationFromItem(item);
  const snapshot = runRow.flow_snapshot_json;
  const stepLog: StepRunResult[] = [];
  const cnpj = String(item.cnpj ?? "").startsWith("gplace:") ? "" : String(item.cnpj ?? "");
  const hasCnpj = isValidCnpjDigits(cnpj);
  let presetPlaceId = item.google_place_id != null ? String(item.google_place_id) : null;

  if (!station) {
    await updateItem(itemId, { status: "error", error_message: "Dados da fonte ausentes" });
    return;
  }

  if (stepEnabled(snapshot, "validate_cnpj")) {
    if (hasCnpj) {
      const existingId = await findExistingClientIdByCnpj(cnpj);
      if (existingId) {
        stepLog.push({ step_key: "validate_cnpj", status: "ok", message: "Já no CRM" });
        await updateItem(itemId, {
          status: "existing",
          client_id: existingId,
          enrichment_json: appendStepLog(null, stepLog)
        });
        return;
      }
      stepLog.push({ step_key: "validate_cnpj", status: "ok" });
    } else if (presetPlaceId) {
      stepLog.push({ step_key: "validate_cnpj", status: "na", message: "Sem CNPJ na fonte (Google)" });
    } else {
      stepLog.push({ step_key: "validate_cnpj", status: "error", message: "CNPJ inválido ou ausente" });
      if (onFailPolicy(snapshot, "validate_cnpj") === "stop") {
        await updateItem(itemId, {
          status: "skipped_invalid_cnpj",
          error_message: "CNPJ inválido ou ausente",
          enrichment_json: appendStepLog(null, stepLog)
        });
        return;
      }
    }
  } else if (hasCnpj) {
    const existingId = await findExistingClientIdByCnpj(cnpj);
    if (existingId) {
      await updateItem(itemId, { status: "existing", client_id: existingId });
      return;
    }
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

  const doGoogleSearch = stepEnabled(snapshot, "google_place_search") && !presetPlaceId;
  const doGoogleDetails = stepEnabled(snapshot, "google_place_details");

  if (!runRow.simulation && apiKey && (doGoogleSearch || doGoogleDetails)) {
    if (hasCnpj) {
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
          stepLog.push({ step_key: "google_place_search", status: "skipped", message: "Cache" });
        }
      }
    }

    if (!googleSnap && doGoogleSearch) {
      let counts = { ...runRow.counts_json };
      const gate = await canAttemptGoogleApi(counts.google_api_attempts ?? 0);
      if (!gate.ok) {
        await pauseRunForGoogleLimit(runId, counts, gate.error_message, itemId);
        return;
      }

      const query = buildGoogleSearchQuery(station);
      const found = await findPlaceId(apiKey, query, station);
      counts = await registerGoogleApiAttempt(runId, counts);
      runRow.counts_json = counts;

      if (!found) {
        stepLog.push({ step_key: "google_place_search", status: "error", message: "Sem correspondência" });
        if (onFailPolicy(snapshot, "google_place_search") === "stop") {
          await updateItem(itemId, { status: "no_google_match", enrichment_json: appendStepLog(null, stepLog) });
          return;
        }
      } else {
        const match = validateGoogleMatch(station, found.name, found.formatted_address);
        if (match === "rejected") {
          stepLog.push({ step_key: "google_place_search", status: "error", message: "Rejeitada" });
          if (onFailPolicy(snapshot, "google_place_search") === "stop") {
            await updateItem(itemId, {
              status: "no_google_match",
              error_message: "Correspondência Google rejeitada",
              enrichment_json: appendStepLog(null, stepLog)
            });
            return;
          }
        } else if (match === "ambiguous") {
          stepLog.push({ step_key: "google_place_search", status: "error", message: "Incerta" });
          await updateItem(itemId, {
            status: "ambiguous",
            google_place_id: found.place_id,
            error_message: "Correspondência Google incerta — revisão manual",
            enrichment_json: appendStepLog(null, stepLog)
          });
          return;
        } else {
          presetPlaceId = found.place_id;
          stepLog.push({ step_key: "google_place_search", status: "ok" });
        }
      }
    } else if (presetPlaceId && !doGoogleSearch) {
      stepLog.push({ step_key: "google_place_search", status: "na", message: "Place ID da descoberta" });
    }

    const placeForDetails = presetPlaceId ?? googleSnap?.place_id;
    if (doGoogleDetails && placeForDetails && !googleSnap) {
      let counts = { ...runRow.counts_json };
      const gate = await canAttemptGoogleApi(counts.google_api_attempts ?? 0);
      if (!gate.ok) {
        await pauseRunForGoogleLimit(runId, counts, gate.error_message, itemId);
        return;
      }
      const details = await getPlaceDetails(apiKey, placeForDetails);
      counts = await registerGoogleApiAttempt(runId, counts);
      runRow.counts_json = counts;
      if (details) {
        googleSnap = {
          place_id: details.place_id,
          phone_digits: details.phone_digits,
          phone_display: details.phone_display,
          website: details.website,
          name: details.name,
          formatted_address: details.formatted_address
        };
        stepLog.push({ step_key: "google_place_details", status: "ok" });
        if (hasCnpj) {
          await upsertGoogleCache(cnpj, details.place_id, {
            ...details,
            collected_at: nowIso(),
            source: "Google Places"
          });
        }
      } else {
        stepLog.push({ step_key: "google_place_details", status: "error", message: "Detalhes indisponíveis" });
      }
    } else if (doGoogleDetails && !placeForDetails) {
      stepLog.push({ step_key: "google_place_details", status: "na", message: "Sem Place ID" });
    }
  } else if (stepEnabled(snapshot, "google_place_search") && !apiKey && !runRow.simulation) {
    stepLog.push({ step_key: "google_place_search", status: "na", message: "Google não configurado" });
  }

  let receita: Awaited<ReturnType<typeof enrichFromReceita>> = {};
  if (stepEnabled(snapshot, "receita_cnpj") && hasCnpj) {
    try {
      receita = await enrichFromReceita(cnpj, runRow.simulation);
      stepLog.push({ step_key: "receita_cnpj", status: Object.keys(receita).length ? "ok" : "skipped" });
    } catch {
      receita = {};
      stepLog.push({ step_key: "receita_cnpj", status: "error" });
    }
  } else if (stepEnabled(snapshot, "receita_cnpj") && !hasCnpj) {
    stepLog.push({ step_key: "receita_cnpj", status: "na", message: "Sem CNPJ" });
  }

  if (stepEnabled(snapshot, "website_enrich")) {
    const site = googleSnap?.website ?? receita.website ?? "";
    stepLog.push({
      step_key: "website_enrich",
      status: site ? "skipped" : "na",
      message: site ? "URL via Google/Receita" : "Integração de scraping não configurada"
    });
  }
  if (stepEnabled(snapshot, "instagram_enrich")) {
    stepLog.push({
      step_key: "instagram_enrich",
      status: "na",
      message: "Integração Instagram não configurada"
    });
  }

  const enrichment = mergeEnrichment(station, receita, googleSnap);
  enrichment.sources.push(`Coletado em ${nowIso()}`);

  if (!stepEnabled(snapshot, "create_crm_client")) {
    await updateItem(itemId, {
      status: "ambiguous",
      google_place_id: googleSnap?.place_id ?? presetPlaceId,
      enrichment_json: appendStepLog({ ...enrichment, google: googleSnap }, stepLog),
      error_message: "Etapa de criação desativada no fluxo"
    });
    return;
  }

  if (!hasCnpj) {
    await updateItem(itemId, {
      status: "ambiguous",
      google_place_id: googleSnap?.place_id ?? presetPlaceId,
      enrichment_json: appendStepLog({ ...enrichment, google: googleSnap }, stepLog),
      error_message: "CNPJ não identificado com confiança — revisão manual"
    });
    return;
  }

  try {
    const clientId = await createClientFromLead({
      station,
      enrichment,
      bdr_user_id: runRow.bdr_user_id,
      product_id: runRow.product_id,
      run_id: runId,
      google_place_id: googleSnap?.place_id ?? presetPlaceId
    });
    stepLog.push({ step_key: "create_crm_client", status: "ok" });
    await updateItem(itemId, {
      status: "created",
      client_id: clientId,
      google_place_id: googleSnap?.place_id ?? presetPlaceId,
      enrichment_json: appendStepLog({ ...enrichment, google: googleSnap }, stepLog)
    });
    if (googleSnap || presetPlaceId) {
      await recordGoogleSuccessResult(runId);
      runRow.google_calls_used += 1;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao criar cliente";
    stepLog.push({ step_key: "create_crm_client", status: "error", message: msg });
    if (/cnpj|duplicate|unique/i.test(msg)) {
      const again = await findExistingClientIdByCnpj(cnpj);
      await updateItem(itemId, {
        status: "existing",
        client_id: again,
        error_message: "CNPJ já existia ao gravar",
        enrichment_json: appendStepLog(null, stepLog)
      });
    } else {
      await updateItem(itemId, { status: "error", error_message: msg, enrichment_json: appendStepLog(null, stepLog) });
    }
  }
}

async function whenProcessingQueueEmpty(
  runId: number,
  runRow: NonNullable<Awaited<ReturnType<typeof getLeadGenerationRun>>>
) {
  const recomp = await recomputeCounts(runId, runRow);
  let { counts } = recomp;
  const { pending, processing } = recomp;
  counts = bumpProgressTracking(counts, runRow.phase);

  if (pending === 0 && processing > 0) {
    await updateRun(runId, { counts_json: counts });
    return;
  }
  const created = counts.created ?? 0;
  const target = runRow.max_stations;
  const citiesDone = anpLoadComplete(counts);
  const itemsTotal = counts.items_total ?? 0;
  const anpFound = counts.anp_found ?? 0;

  if (target > 0 && created < target && !citiesDone) {
    await updateRun(runId, { phase: "anp_load", counts_json: counts });
    return;
  }

  if (citiesDone && itemsTotal === 0 && anpFound === 0) {
    await updateRun(runId, {
      status: "failed",
      phase: "done",
      counts_json: counts,
      progress_pct: 100,
      completed_at: nowIso(),
      error_message: buildAnpEmptyRunError(runRow.uf)
    });
    return;
  }

  if (target > 0 && created < target && citiesDone) {
    const expanded = await tryExpandRunGeography(runId);
    if (expanded) return;
  }

  if (shouldFailNoSuccess(counts, target)) {
    await updateRun(runId, {
      status: "failed",
      phase: "done",
      counts_json: counts,
      progress_pct: 100,
      completed_at: nowIso(),
      error_message: buildStuckRunError({ counts, target, reason: "no_success" })
    });
    return;
  }

  await updateRun(runId, { phase: "finalizing", counts_json: counts });
  await tickFinalizing(runId);
}

async function syncGoogleSuccessCounter(runId: number, runRow: NonNullable<Awaited<ReturnType<typeof getLeadGenerationRun>>>) {
  const created = await createdCountForRun(runId);
  if (runRow.google_calls_used !== created) {
    await updateRun(runId, { google_calls_used: created });
    runRow.google_calls_used = created;
  }
}

async function tickProcessing(runId: number) {
  const runRow = await getLeadGenerationRun(runId);
  if (!runRow) return;

  if (!anpLoadComplete(runRow.counts_json ?? emptyCounts())) {
    await updateRun(runId, { phase: "anp_load", error_message: null });
    await tickAnpLoad(runId);
    return;
  }

  await syncGoogleSuccessCounter(runId, runRow);

  if (await targetCreatedReached(runId, runRow.max_stations)) {
    await dropRemainingPending(runId);
    await updateRun(runId, { phase: "finalizing" });
    await tickFinalizing(runId);
    return;
  }

  const ids = await fetchRunnableItemIds(runId, ITEMS_PER_CRON_TICK, ITEM_PROCESSING_STALE_MS);
  if (ids.length === 0) {
    await whenProcessingQueueEmpty(runId, runRow);
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
    await tickFinalizing(runId);
    return;
  }

  let { counts } = await recomputeCounts(runId, freshRun);
  counts = bumpProgressTracking(counts, freshRun.phase);
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
  let status: "completed" | "partial" | "failed" = "completed";
  let error_message: string | null = null;

  if (target > 0 && created === 0 && (counts.items_total ?? 0) === 0) {
    status = "failed";
    error_message = buildStuckRunError({ counts, target, reason: "no_success" });
  } else if (shouldFailNoSuccess(counts, target)) {
    status = "failed";
    error_message = buildStuckRunError({ counts, target, reason: "no_success" });
  } else if (target > 0 && created < target && ((counts.processed ?? 0) > 0 || (counts.errors ?? 0) > 0)) {
    status = "partial";
    error_message = buildPartialRunLog({
      target,
      counts,
      geoExpanded: Boolean(counts.geo_expanded),
      exhaustedGeo: isGeoExpansionExhausted(counts, runRow.filters_json.all_cities_in_uf)
    });
  }

  await updateRun(runId, {
    status,
    phase: "done",
    counts_json: counts,
    progress_pct: 100,
    completed_at: nowIso(),
    error_message
  });
}

/** Atualiza metadados ANP e status antes de chamadas lentas (primeiro tick / poll). */
export async function bootstrapLeadGenRunAnpMetadata(runId: number): Promise<void> {
  let runRow = await getLeadGenerationRun(runId);
  if (!runRow || !["queued", "running"].includes(runRow.status)) return;

  if (runRow.status === "queued") {
    await updateRun(runId, { status: "running", started_at: nowIso() });
    runRow = await getLeadGenerationRun(runId);
    if (!runRow) return;
  }

  const pairs = cityPairsForInitialSource(runInitialSource(runRow), runRow.uf, runRow.filters_json);
  if (runRow.phase !== "anp_load" && runRow.phase !== "processing") return;
  if (runRow.phase === "processing" && anpLoadComplete(runRow.counts_json ?? emptyCounts())) return;

  if (runRow.phase === "processing") {
    await updateRun(runId, { phase: "anp_load", error_message: null });
    runRow = (await getLeadGenerationRun(runId))!;
    if (!runRow) return;
  }

  const counts = { ...runRow.counts_json };
  if (pairs.length > 0 && (counts.cities_total ?? 0) !== pairs.length) {
    counts.cities_total = pairs.length;
    await updateRun(runId, {
      counts_json: counts,
      progress_pct: computeRunProgressPct({
        phase: runRow.phase,
        status: "running",
        max_stations: runRow.max_stations,
        counts_json: counts
      })
    });
  }
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

  await bootstrapLeadGenRunAnpMetadata(runId);
  runRow = (await getLeadGenerationRun(runId))!;

  const meta = await syncRunProgressMetadata(runId, runRow);
  if (meta.paused) {
    return { processedRunId: runId, action: "stale_paused" };
  }
  runRow = (await getLeadGenerationRun(runId))!;

  if (runRow.status === "running" && runRow.phase !== "finalizing") {
    const { counts: liveCounts } = await recomputeCounts(runId, runRow);
    const tracked = bumpProgressTracking(liveCounts, runRow.phase);
    if ((tracked.no_progress_ticks ?? 0) >= NO_PROGRESS_TICK_FAIL) {
      await updateRun(runId, {
        status: "failed",
        phase: "done",
        counts_json: tracked,
        progress_pct: 100,
        completed_at: nowIso(),
        error_message: buildStuckRunError({
          counts: tracked,
          target: runRow.max_stations,
          reason: "no_progress"
        })
      });
      return { processedRunId: runId, action: "stuck_failed" };
    }
    if (tracked.no_progress_ticks !== liveCounts.no_progress_ticks) {
      await updateRun(runId, { counts_json: tracked });
    }
  }

  if (runRow.phase === "finalizing") {
    await tickFinalizing(runId);
    return { processedRunId: runId, action: "finalizing" };
  }

  if (runRow.status === "paused") {
    return { processedRunId: runId, action: "paused" };
  }

  if (runRow.phase === "anp_load") {
    await tickAnpLoad(runId);
    const afterAnp = await getLeadGenerationRun(runId);
    if (afterAnp?.phase === "processing") {
      await tickProcessing(runId);
      await logMotorTickAction(runId, "anp_load+processing");
      return { processedRunId: runId, action: "anp_load+processing" };
    }
    await logMotorTickAction(runId, "anp_load");
    return { processedRunId: runId, action: "anp_load" };
  }
  if (runRow.phase === "processing") {
    await tickProcessing(runId);
    await logMotorTickAction(runId, "processing");
    return { processedRunId: runId, action: "processing" };
  }
  return { processedRunId: runId, action: "noop" };
}

async function logMotorTickAction(runId: number, action: string) {
  const row = await getLeadGenerationRun(runId);
  if (!row) return;
  const counts = appendMotorLog(row.counts_json, `tick ${action}`);
  await updateRun(runId, { counts_json: counts });
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
