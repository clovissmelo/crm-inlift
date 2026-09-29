/** Progresso 0–100 para UI e persistência (ANP ~35%, meta de novos ~65%). */

const ANP_WEIGHT = 35;

export function computeRunProgressPct(input: {
  phase: string;
  status?: string;
  max_stations: number;
  counts_json: Record<string, number>;
}): number {
  const status = input.status;
  if (status === "completed") return 100;

  const counts = input.counts_json ?? {};
  const maxStations = Math.max(1, input.max_stations);
  const citiesTotal = counts.cities_total ?? 0;
  const citiesLoaded = counts.cities_loaded ?? 0;
  const created = counts.created ?? 0;
  const processed = counts.processed ?? 0;
  const itemsTotal = counts.items_total ?? 0;

  const citiesComplete = citiesTotal > 0 && citiesLoaded >= citiesTotal;
  const anpRatio =
    citiesTotal > 0
      ? Math.min(1, citiesLoaded / citiesTotal)
      : input.phase === "anp_load"
        ? 0.02
        : 1;

  let goalRatio = Math.min(1, created / maxStations);
  if (goalRatio === 0 && itemsTotal > 0 && processed > 0 && input.phase !== "anp_load") {
    goalRatio = Math.min(0.85, processed / itemsTotal);
  }

  let pct: number;
  if (citiesTotal === 0 && input.phase === "anp_load") {
    pct = 2;
  } else if (!citiesComplete) {
    const anpPart = anpRatio * ANP_WEIGHT;
    const goalPart = goalRatio * (100 - ANP_WEIGHT) * anpRatio;
    pct = anpPart + goalPart;
  } else {
    pct = ANP_WEIGHT + goalRatio * (100 - ANP_WEIGHT);
  }

  if (input.phase === "finalizing") pct = Math.max(pct, 96);
  if (status === "failed" || status === "cancelled") return Math.round(Math.min(100, pct));

  return Math.min(99, Math.max(citiesTotal > 0 || input.phase !== "anp_load" ? 1 : 0, Math.round(pct)));
}

export function runProgressDetail(input: {
  phase: string;
  max_stations: number;
  counts_json: Record<string, number>;
}): string {
  const counts = input.counts_json ?? {};
  const citiesTotal = counts.cities_total ?? 0;
  const citiesLoaded = counts.cities_loaded ?? 0;
  const created = counts.created ?? 0;

  if (input.phase === "anp_load" && citiesTotal === 0) {
    return "Preparando cidades…";
  }
  if (input.phase === "anp_load" && citiesTotal > 0 && citiesLoaded < citiesTotal) {
    return `ANP ${citiesLoaded}/${citiesTotal} cidades`;
  }
  if (input.phase === "anp_load" && citiesTotal > 0 && citiesLoaded >= citiesTotal) {
    return "ANP completa, enfileirando postos…";
  }
  if (created > 0) return `${created}/${input.max_stations} novos cadastrados`;
  if (input.phase === "processing" && (counts.processed ?? 0) > 0) {
    return `${counts.processed} postos analisados`;
  }
  if (input.phase === "anp_load") return "Consultando ANP…";
  return PHASE_SHORT[input.phase] ?? input.phase;
}

const PHASE_SHORT: Record<string, string> = {
  anp_load: "Carregando ANP",
  processing: "Processando postos",
  finalizing: "Finalizando",
  done: "Concluído"
};
