"use client";

import "./lead-gen-execution.css";
import Link from "next/link";
import { Info, Play, Trash2, X } from "lucide-react";
import {
  AdminNovosLeadsCityPicker,
  type CitySelectionPayload,
  type UfOption
} from "@/components/admin-novos-leads-city-picker";
import { LeadGenFlowField } from "@/components/lead-gen-flow-field";
import {
  LeadGenAnpPreviewModal,
  type AnpPreviewPayload
} from "@/components/lead-gen-anp-preview-modal";
import {
  LeadGenExecutionOverlay,
  type LeadGenActivityLine
} from "@/components/lead-gen-execution-overlay";
import { LeadGenOverlayLayer } from "@/components/lead-gen-overlay-layer";
import {
  NOVOS_LEADS_META_REFRESH_MS,
  novosLeadsPollIntervalMs,
  resolveNovosLeadsPollTarget
} from "@/lib/lead-generation/novos-leads-live-sync";
import { computeRunProgressPct, runProgressDetail } from "@/lib/lead-generation/run-progress";
import { formatRunResultsSummary } from "@/lib/lead-generation/run-outcome";
import type { LeadGenCounts } from "@/lib/lead-generation/types";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type RunFilters = {
  cities: string[];
  regions?: string[];
  all_cities_in_uf: boolean;
  segment: string;
};

type RunRow = {
  id: number;
  status: string;
  phase: string;
  uf: string;
  simulation: boolean;
  progress_pct: number;
  max_stations: number;
  max_google_calls: number;
  google_calls_used: number;
  product_id: number | null;
  bdr_user_id: number | null;
  filters_json: RunFilters;
  counts_json: Record<string, number>;
  error_message: string | null;
  created_at: string;
  requested_by_name?: string;
};

type RunDetail = RunRow;

type QuotaPanel = {
  google_configured: boolean;
  daily_limit: number;
  used_today: number;
  available_today: number;
  per_run_limit: number;
};

const PHASE_LABEL: Record<string, string> = {
  anp_load: "Carregando fonte",
  processing: "Enriquecimento",
  finalizing: "Finalizando",
  done: "Concluído"
};

const RUN_POLL_STATUSES = new Set(["queued", "running", "paused"]);
const TERMINAL_RUN_STATUSES = new Set(["completed", "partial", "failed", "cancelled"]);

function shouldApplyRunUpdate(prev: RunRow | null | undefined, incoming: RunRow): boolean {
  if (!prev || prev.id !== incoming.id) return true;
  if (TERMINAL_RUN_STATUSES.has(prev.status) && !TERMINAL_RUN_STATUSES.has(incoming.status)) return false;
  return true;
}

const TICK_BUSY_PHASE_LINE =
  "Consultando ANP / Google… (cada ciclo pode levar até ~40s na nuvem)";

function runNeedsLeadGenDrain(run: { status: string; phase: string } | null | undefined): boolean {
  if (!run) return true;
  if (run.status === "queued" || run.status === "running") return true;
  if (run.status === "paused" && run.phase === "finalizing") return true;
  return false;
}

const RUN_STATUS_LABEL: Record<string, string> = {
  queued: "Na fila",
  running: "Em execução",
  paused: "Pausada",
  completed: "Concluída",
  partial: "Parcial",
  failed: "Insucesso",
  cancelled: "Cancelada"
};

function segmentLabel(segment: string, options: Array<{ slug: string; label: string }>): string {
  return options.find((o) => o.slug === segment)?.label ?? segment;
}

function formatRunGeo(filters: RunFilters, uf: string): { line: string; title?: string } {
  if (filters.all_cities_in_uf) return { line: `Todas as cidades (${uf})` };
  const cities = filters.cities ?? [];
  const regions = filters.regions ?? [];
  if (cities.length > 0) {
    return { line: `${cities.length} cidade${cities.length === 1 ? "" : "s"}`, title: cities.join(", ") };
  }
  if (regions.length > 0) {
    return { line: `${regions.length} zona${regions.length === 1 ? "" : "s"}`, title: regions.join(", ") };
  }
  return { line: "—" };
}

function LeadGenRunProgressBar({
  run,
  compact = false
}: {
  run: {
    phase: string;
    status: string;
    progress_pct: number;
    max_stations: number;
    counts_json: Record<string, number>;
  };
  compact?: boolean;
}) {
  const pct = computeRunProgressPct(run);
  const detail = runProgressDetail(run);
  return (
    <div className={`lead-gen-progress${compact ? " lead-gen-progress--compact" : ""}`}>
      <div className="lead-gen-progress-head">
        <span className="lead-gen-progress-pct">{pct}%</span>
        <span className="lead-gen-progress-detail muted">{detail}</span>
      </div>
      <div className="lead-gen-progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="lead-gen-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function formatRunResults(counts: Record<string, number>): string {
  return formatRunResultsSummary(counts as unknown as LeadGenCounts);
}

function showRunResultColumn(r: RunRow): boolean {
  if (["completed", "partial", "failed"].includes(r.status)) return true;
  return (r.counts_json?.processed ?? 0) > 0;
}

export function AdminNovosLeadsWizard() {
  const pathname = usePathname();
  const onNovosLeadsPage = pathname === "/admin/novos-leads" || pathname.startsWith("/admin/novos-leads/");

  const [ufOptions, setUfOptions] = useState<UfOption[]>([]);
  const [uf, setUf] = useState("");
  const [allCities, setAllCities] = useState(false);
  const [citySelection, setCitySelection] = useState<CitySelectionPayload>({ municipalities: [], commercial_zone_ids: [] });
  const [segment, setSegment] = useState("all");
  const [segmentOptions, setSegmentOptions] = useState<Array<{ slug: string; label: string }>>([]);
  const [bdrUserId, setBdrUserId] = useState<number | "">("");
  const [productId, setProductId] = useState<number | "">("");
  const [quota, setQuota] = useState<QuotaPanel | null>(null);

  const [runs, setRuns] = useState<RunRow[]>([]);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [activeRun, setActiveRun] = useState<RunDetail | null>(null);
  const [resultTab, setResultTab] = useState<"created" | "existing" | "ambiguous" | "errors">("created");
  const [resultItems, setResultItems] = useState<Array<{ id: number; cnpj: string; client_id: number | null; status: string; error_message: string | null }>>([]);

  const [bdrs, setBdrs] = useState<Array<{ id: number; name: string }>>([]);
  const [products, setProducts] = useState<
    Array<{ id: number; name: string; lead_gen_segment_slug: string | null; lead_gen_flow_id: number | null }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [leadsRequested, setLeadsRequested] = useState(1);
  const [execOverlayOpen, setExecOverlayOpen] = useState(false);
  const [backgroundRunNotice, setBackgroundRunNotice] = useState(false);
  const [activityFeed, setActivityFeed] = useState<LeadGenActivityLine[]>([]);
  const [phaseLine, setPhaseLine] = useState<string | null>(null);
  const [tickBusy, setTickBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [lastRefreshedLabel, setLastRefreshedLabel] = useState<string | null>(null);
  const [anpPreviewOpen, setAnpPreviewOpen] = useState(false);
  const [anpPreviewLoading, setAnpPreviewLoading] = useState(false);
  const [anpPreviewData, setAnpPreviewData] = useState<AnpPreviewPayload | null>(null);
  const [anpPreviewError, setAnpPreviewError] = useState<string | null>(null);
  const [summaryRunId, setSummaryRunId] = useState<number | null>(null);

  const [flowPreview, setFlowPreview] = useState<{
    name: string;
    initial_source: string;
    steps: Array<{ step_key: string; label: string; enabled: boolean; on_fail: string; sort_order: number }>;
  } | null>(null);

  const maxLeadsRequested = quota?.per_run_limit ?? 100;

  const listActiveRun = useMemo(() => {
    const actives = runs.filter((r) => RUN_POLL_STATUSES.has(r.status));
    if (actives.length === 0) return null;
    if (activeRunId != null) {
      const match = actives.find((r) => r.id === activeRunId);
      if (match) return match;
    }
    return actives[0];
  }, [runs, activeRunId]);

  const shownRun = useMemo(() => {
    if (starting && activeRunId == null && activeRun?.id === 0) return activeRun;
    if (activeRunId != null && activeRunId > 0) {
      if (activeRun?.id === activeRunId) return activeRun;
      const fromList = runs.find((r) => r.id === activeRunId);
      if (fromList) {
        return activeRun?.id === fromList.id ? { ...fromList, ...activeRun } : fromList;
      }
      if (activeRun) return { ...activeRun, id: activeRunId };
    }
    if (activeRun && listActiveRun && activeRun.id === listActiveRun.id) return activeRun;
    if (activeRun && !listActiveRun) return activeRun;
    return listActiveRun;
  }, [activeRunId, runs, activeRun, listActiveRun, starting]);

  const shownRunActive = shownRun != null && ["queued", "running", "paused"].includes(shownRun.status);

  function clampLeadsRequested(value: number) {
    const max = maxLeadsRequested;
    if (!Number.isFinite(value)) return 1;
    return Math.min(max, Math.max(1, Math.floor(value)));
  }

  const hasGeoSelection = allCities || citySelection.municipalities.length > 0;

  const productNameById = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);
  const bdrNameById = useMemo(() => new Map(bdrs.map((b) => [b.id, b.name])), [bdrs]);
  const selectedProduct = useMemo(
    () => (productId !== "" ? products.find((p) => p.id === productId) : undefined),
    [productId, products]
  );
  const segmentLockedByProduct = Boolean(selectedProduct?.lead_gen_segment_slug);

  const loadMeta = useCallback(async () => {
    const [uRes, pRes, rRes, geoRes, quotaRes, segRes] = await Promise.all([
      fetch("/api/users"),
      fetch("/api/products"),
      fetch("/api/admin/lead-generation/runs"),
      fetch("/api/admin/lead-generation/geo"),
      fetch("/api/admin/lead-generation/quota"),
      fetch("/api/admin/lead-generation/segments?active=1")
    ]);
    if (uRes.ok) {
      const u = (await uRes.json()) as { users: Array<{ id: number; name: string; roles: string[] }> };
      setBdrs(u.users.filter((x) => x.roles.includes("bdr")).map((x) => ({ id: x.id, name: x.name })));
    }
    if (pRes.ok) {
      const p = (await pRes.json()) as {
        products: Array<{ id: number; name: string; lead_gen_segment_slug?: string | null; lead_gen_flow_id?: number | null }>;
      };
      setProducts(
        (p.products ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          lead_gen_segment_slug: row.lead_gen_segment_slug ?? null,
          lead_gen_flow_id: row.lead_gen_flow_id ?? null
        }))
      );
    }
    if (rRes.ok) {
      const r = (await rRes.json()) as { runs: RunRow[] };
      const rows = r.runs ?? [];
      setRuns(rows);
      const active = rows.find((x) => RUN_POLL_STATUSES.has(x.status));
      if (active) {
        setActiveRunId((prev) => {
          if (prev != null && rows.some((x) => x.id === prev && RUN_POLL_STATUSES.has(x.status))) {
            return prev;
          }
          return active.id;
        });
      }
    }
    if (geoRes.ok) {
      const g = (await geoRes.json()) as { ufs: UfOption[] };
      setUfOptions(g.ufs ?? []);
    }
    if (quotaRes.ok) {
      const q = (await quotaRes.json()) as QuotaPanel;
      setQuota(q);
      setLeadsRequested((prev) => Math.min(Math.max(1, prev), q.per_run_limit));
    }
    if (segRes.ok) {
      const s = (await segRes.json()) as { segments?: Array<{ slug: string; label: string }> };
      const opts = s.segments ?? [];
      setSegmentOptions(opts);
      setSegment((prev) => (opts.some((o) => o.slug === prev) ? prev : (opts[0]?.slug ?? "all")));
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (!onNovosLeadsPage) return;
    const refreshList = () => {
      if (document.visibilityState === "hidden") return;
      void loadMeta();
    };
    const t = window.setInterval(refreshList, NOVOS_LEADS_META_REFRESH_MS);
    window.addEventListener("focus", refreshList);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", refreshList);
    };
  }, [onNovosLeadsPage, loadMeta]);

  useEffect(() => {
    if (selectedProduct?.lead_gen_segment_slug) {
      setSegment(selectedProduct.lead_gen_segment_slug);
    }
  }, [productId, selectedProduct?.lead_gen_segment_slug]);

  useEffect(() => {
    void (async () => {
      const flowQuery =
        selectedProduct?.lead_gen_flow_id != null
          ? `flow_id=${selectedProduct.lead_gen_flow_id}`
          : `segment=${encodeURIComponent(segment)}`;
      const res = await fetch(`/api/admin/lead-generation/flows?${flowQuery}`);
      if (!res.ok) {
        setFlowPreview(null);
        return;
      }
      const data = (await res.json()) as {
        snapshot?: {
          name: string;
          initial_source: string;
          steps: Array<{ step_key: string; label: string; enabled: boolean; on_fail: string; sort_order: number }>;
        };
      };
      const snap = data.snapshot;
      if (!snap) {
        setFlowPreview(null);
        return;
      }
      setFlowPreview({
        name: snap.name,
        initial_source: snap.initial_source,
        steps: [...snap.steps].sort((a, b) => a.sort_order - b.sort_order).filter((s) => s.enabled)
      });
    })();
  }, [segment, selectedProduct?.lead_gen_flow_id]);

  const pollGenerationRef = useRef(0);

  const applyRunRow = useCallback((run: RunDetail) => {
    setActiveRun((prev) => (prev && !shouldApplyRunUpdate(prev, run) ? prev : run));
    setRuns((prev) => {
      const existing = prev.find((row) => row.id === run.id);
      if (existing && !shouldApplyRunUpdate(existing, run)) return prev;
      if (existing) {
        return prev.map((row) => (row.id === run.id ? { ...row, ...run } : row));
      }
      return [run, ...prev];
    });
  }, []);

  const fetchRunDetail = useCallback(
    async (id: number, tab?: typeof resultTab, opts?: { feed?: boolean }) => {
      const params = new URLSearchParams();
      if (tab) params.set("tab", tab);
      if (opts?.feed) params.set("feed", "1");
      const q = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`/api/admin/lead-generation/runs/${id}${q}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        run: RunDetail;
        items?: typeof resultItems;
        activity?: LeadGenActivityLine[];
        phase_line?: string | null;
      };
      applyRunRow(data.run);
      if (data.items) setResultItems(data.items as typeof resultItems);
      if (opts?.feed) {
        if (data.activity) setActivityFeed(data.activity);
        if (data.phase_line !== undefined) setPhaseLine(data.phase_line);
      }
    },
    [applyRunRow]
  );

  const summaryRun = useMemo(
    () => (summaryRunId != null ? runs.find((r) => r.id === summaryRunId) ?? null : null),
    [summaryRunId, runs]
  );

  function openRunSummary(runId: number) {
    setSummaryRunId(runId);
  }

  function openRunVerMais(runId: number) {
    setSummaryRunId(runId);
    setActiveRunId(runId);
    setExecOverlayOpen(true);
    setBackgroundRunNotice(false);
    void fetchRunDetail(runId, resultTab, { feed: true });
  }

  const runsRef = useRef(runs);
  runsRef.current = runs;
  const activeRunRef = useRef(activeRun);
  activeRunRef.current = activeRun;

  const applyPollPayload = useCallback(
    (
      data: {
        run: RunDetail;
        activity?: LeadGenActivityLine[];
        phase_line?: string | null;
      },
      withFeed: boolean,
      pollGeneration: number
    ) => {
      if (pollGeneration !== pollGenerationRef.current) return;
      applyRunRow(data.run);
      if (!withFeed) return;
      if (data.activity !== undefined) setActivityFeed(data.activity);
      if (data.phase_line !== undefined) setPhaseLine(data.phase_line);
    },
    [applyRunRow]
  );

  const refreshRunProgress = useCallback(
    async (id: number, withFeed = false, pollGeneration = pollGenerationRef.current) => {
      if (id <= 0 || pollGeneration !== pollGenerationRef.current) return;
      const q = withFeed ? "?feed=1&refresh=1" : "?refresh=1";
      const res = await fetch(`/api/admin/lead-generation/runs/${id}${q}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        run: RunDetail;
        activity?: LeadGenActivityLine[];
        phase_line?: string | null;
      };
      applyPollPayload(data, withFeed, pollGeneration);
    },
    [applyPollPayload]
  );

  const pollRunProgress = useCallback(
    async (id: number, withFeed = false, pollGeneration = pollGenerationRef.current) => {
      if (id <= 0) return;
      if (pollGeneration !== pollGenerationRef.current) return;
      const snap =
        activeRunRef.current?.id === id
          ? activeRunRef.current
          : runsRef.current.find((r) => r.id === id);

      if (!runNeedsLeadGenDrain(snap)) {
        await refreshRunProgress(id, withFeed, pollGeneration);
        return;
      }

      setTickBusy(true);
      try {
        const q = withFeed ? "?feed=1" : "";
        const res = await fetch(`/api/admin/lead-generation/runs/${id}/tick${q}`, {
          method: "POST",
          cache: "no-store"
        });
        if (!res.ok) {
          await refreshRunProgress(id, withFeed, pollGeneration);
          return;
        }
        const data = (await res.json()) as {
          run: RunDetail;
          activity?: LeadGenActivityLine[];
          phase_line?: string | null;
        };
        applyPollPayload(data, withFeed, pollGeneration);
      } finally {
        setTickBusy(false);
      }
    },
    [applyPollPayload, refreshRunProgress]
  );

  const tickActiveRun = useCallback(
    async (id: number, withFeed = false) => {
      await pollRunProgress(id, withFeed);
    },
    [pollRunProgress]
  );

  function closeExecOverlay() {
    setExecOverlayOpen(false);
    if (shownRunActive) setBackgroundRunNotice(true);
  }

  function openExecOverlay() {
    setExecOverlayOpen(true);
    setBackgroundRunNotice(false);
    if (shownRun?.id) void tickActiveRun(shownRun.id, true);
  }

  useEffect(() => {
    if (listActiveRun && activeRunId !== listActiveRun.id) {
      setActiveRunId(listActiveRun.id);
    }
  }, [listActiveRun, activeRunId]);

  const tickInFlightRef = useRef(false);
  const prevRunStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!shownRun) return;
    const terminal = ["completed", "partial", "failed", "cancelled"].includes(shownRun.status);
    const wasActive =
      prevRunStatusRef.current != null && RUN_POLL_STATUSES.has(prevRunStatusRef.current);
    if (terminal && wasActive && !execOverlayOpen) {
      setBackgroundRunNotice(true);
    }
    prevRunStatusRef.current = shownRun.status;
  }, [shownRun, shownRun?.status, execOverlayOpen]);

  const runIdToPoll = useMemo(() => {
    if (starting) return null;
    if (activeRunId != null && activeRunId > 0) {
      const status =
        activeRun?.id === activeRunId
          ? activeRun.status
          : (runs.find((r) => r.id === activeRunId)?.status ?? activeRun?.status ?? "queued");
      if (RUN_POLL_STATUSES.has(status)) return activeRunId;
    }
    if (listActiveRun && RUN_POLL_STATUSES.has(listActiveRun.status)) return listActiveRun.id;
    return null;
  }, [listActiveRun, activeRunId, activeRun?.id, activeRun?.status, runs, starting]);

  const pollTarget = useMemo(
    () =>
      resolveNovosLeadsPollTarget({
        starting,
        runIdToPoll,
        execOverlayOpen,
        backgroundRunNotice,
        shownRunId: shownRun?.id,
        getRun: (id) => {
          if (activeRunRef.current?.id === id) return activeRunRef.current;
          return runsRef.current.find((r) => r.id === id);
        }
      }),
    [
      starting,
      runIdToPoll,
      execOverlayOpen,
      backgroundRunNotice,
      shownRun?.id,
      shownRun?.status,
      shownRun?.phase
    ]
  );

  useEffect(() => {
    if (!onNovosLeadsPage || pollTarget == null) return;

    let cancelled = false;
    const pollId = pollTarget.id;
    const pollMode = pollTarget.mode;
    const withFeed = execOverlayOpen || backgroundRunNotice;

    async function pollOnce() {
      if (cancelled || document.visibilityState === "hidden") return;
      const gen = pollGenerationRef.current;
      if (pollMode === "refresh") {
        await refreshRunProgress(pollId, withFeed, gen);
        return;
      }
      if (tickInFlightRef.current) {
        await refreshRunProgress(pollId, withFeed, gen);
        return;
      }
      tickInFlightRef.current = true;
      try {
        await pollRunProgress(pollId, withFeed, gen);
      } finally {
        tickInFlightRef.current = false;
      }
    }

    void pollOnce();

    function intervalMs() {
      const snap =
        activeRunRef.current?.id === pollId
          ? activeRunRef.current
          : runsRef.current.find((r) => r.id === pollId);
      return novosLeadsPollIntervalMs({
        mode: pollMode,
        execOverlayOpen,
        backgroundRunNotice,
        runSnap: snap
      });
    }

    const t = window.setInterval(() => void pollOnce(), intervalMs());

    function onVisibility() {
      if (document.visibilityState === "visible") void pollOnce();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [
    onNovosLeadsPage,
    pollTarget,
    execOverlayOpen,
    backgroundRunNotice,
    pollRunProgress,
    refreshRunProgress
  ]);

  function leadGenSelectionPayload() {
    return {
      uf,
      municipalities: citySelection.municipalities,
      commercial_zone_ids: citySelection.commercial_zone_ids,
      all_cities_in_uf: allCities,
      segment,
      bdr_user_id: bdrUserId === "" ? null : bdrUserId,
      product_id: productId === "" ? null : productId,
      max_stations: clampLeadsRequested(leadsRequested)
    };
  }

  function validateBeforeLeadGen() {
    if (!uf || uf.length !== 2) {
      setError("Selecione uma UF.");
      return false;
    }
    if (!allCities && !hasGeoSelection) {
      setError("Selecione cidades, marque zonas (IBGE) ou marque todas da UF.");
      return false;
    }
    return true;
  }

  async function openAnpPreviewModal(maxStationsOverride?: number) {
    if (!validateBeforeLeadGen()) return;
    const meta = clampLeadsRequested(maxStationsOverride ?? leadsRequested);
    if (maxStationsOverride != null) setLeadsRequested(meta);
    setError(null);
    setAnpPreviewOpen(true);
    setAnpPreviewLoading(true);
    setAnpPreviewData(null);
    setAnpPreviewError(null);
    try {
      const res = await fetch("/api/admin/lead-generation/anp-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...leadGenSelectionPayload(), max_stations: meta })
      });
      const data = (await res.json()) as AnpPreviewPayload & { error?: string };
      if (!res.ok) {
        setAnpPreviewError(data.error ?? "Falha na prévia ANP");
        return;
      }
      setAnpPreviewData(data);
    } catch {
      setAnpPreviewError("Falha ao consultar a ANP.");
    } finally {
      setAnpPreviewLoading(false);
    }
  }

  async function startRun() {
    if (!validateBeforeLeadGen()) return;
    const meta = clampLeadsRequested(leadsRequested);
    if (
      anpPreviewData &&
      anpPreviewData.supported !== false &&
      (anpPreviewData.new_estimated ?? 0) < meta
    ) {
      setError("Volume estimado abaixo da meta. Ajuste cidades ou a meta antes de iniciar.");
      setAnpPreviewOpen(true);
      return;
    }
    if (productId !== "" && citySelection.municipalities.length > 0) {
      const indRes = await fetch("/api/admin/lead-generation/geo/indicators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          ibge_codes: citySelection.municipalities.map((m) => m.ibge_code)
        })
      });
      if (indRes.ok) {
        const indData = (await indRes.json()) as {
          indicators?: Record<string, { status: string; last_at: string }>;
        };
        const prior = citySelection.municipalities.filter((m) => {
          const i = indData.indicators?.[String(m.ibge_code)];
          return i && (i.status === "completed" || i.status === "partial" || i.status === "failed");
        });
        if (prior.length > 0) {
          const lines = prior.slice(0, 8).map((m) => {
            const i = indData.indicators![String(m.ibge_code)]!;
            const d = new Date(i.last_at).toLocaleDateString("pt-BR");
            return `· ${m.name} (${i.status}, ${d})`;
          });
          const more = prior.length > 8 ? `\n… e mais ${prior.length - 8} cidade(s).` : "";
          const ok = window.confirm(
            `Algumas cidades já tiveram geração para este produto:\n${lines.join("\n")}${more}\n\nClientes já cadastrados não serão alterados. Deseja continuar?`
          );
          if (!ok) return;
        }
      }
    }
    setError(null);
    setExecOverlayOpen(true);
    setBackgroundRunNotice(false);
    setActivityFeed([]);
    setPhaseLine("Criando execução…");
    setActiveRun({
      id: 0,
      status: "queued",
      phase: "anp_load",
      uf,
      simulation: false,
      progress_pct: 1,
      max_stations: clampLeadsRequested(leadsRequested),
      max_google_calls: 0,
      google_calls_used: 0,
      product_id: productId === "" ? null : productId,
      bdr_user_id: bdrUserId === "" ? null : bdrUserId,
      filters_json: {
        cities: citySelection.municipalities.map((m) => m.name),
        all_cities_in_uf: allCities,
        segment
      },
      counts_json: {
        cities_total: Math.max(
          1,
          allCities
            ? (anpPreviewData?.cities_total ?? anpPreviewData?.cities?.length ?? 0)
            : citySelection.municipalities.length,
          citySelection.municipalities.length
        ),
        cities_loaded: 0
      },
      error_message: null,
      created_at: new Date().toISOString()
    });
    setStarting(true);
    setAnpPreviewOpen(false);
    const res = await fetch("/api/admin/lead-generation/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(leadGenSelectionPayload())
    });
    const data = (await res.json()) as { id?: number; error?: string; run?: RunDetail };
    setStarting(false);
    if (!res.ok) {
      setError(data.error ?? "Falha ao iniciar");
      setExecOverlayOpen(false);
      setActiveRun(null);
      setPhaseLine(null);
      return;
    }
    if (data.id) {
      const newId = data.id;
      setActiveRunId(newId);
      if (data.run) {
        applyRunRow(data.run);
        setRuns((prev) => {
          const rest = prev.filter((r) => r.id !== newId);
          return [{ ...data.run! }, ...rest];
        });
      } else {
        setActiveRun((prev) => (prev ? { ...prev, id: newId } : null));
      }
      setPhaseLine(null);
      void loadMeta();
      void pollRunProgress(newId, true);
    }
  }

  async function cancelRun(runId = activeRunId ?? listActiveRun?.id) {
    if (!runId) return;
    pollGenerationRef.current += 1;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/lead-generation/runs/${runId}/cancel`, {
        method: "POST",
        cache: "no-store"
      });
      let data: { error?: string; run?: RunDetail } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        setError("Resposta inválida ao cancelar. Tente atualizar a página.");
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Não foi possível cancelar");
        return;
      }
      if (data.run) {
        applyRunRow(data.run);
      } else {
        const base = activeRun?.id === runId ? activeRun : runs.find((r) => r.id === runId);
        if (base) {
          applyRunRow({
            ...base,
            status: "cancelled",
            phase: "done",
            progress_pct: 100,
            error_message: null
          });
        } else {
          await fetchRunDetail(runId);
        }
      }
      setExecOverlayOpen(false);
      setBackgroundRunNotice(false);
      setPhaseLine(null);
      setActivityFeed([]);
      void loadMeta();
    } finally {
      setCancelling(false);
    }
  }

  async function resumeRun(runId = activeRunId) {
    if (!runId) return;
    await fetch(`/api/admin/lead-generation/runs/${runId}/resume`, { method: "POST" });
    void tickActiveRun(runId);
  }

  const manualRefreshRun = useCallback(
    async (runId: number) => {
      setRefreshBusy(true);
      try {
        await refreshRunProgress(runId, true);
        setLastRefreshedLabel(
          new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        );
      } finally {
        setRefreshBusy(false);
      }
    },
    [refreshRunProgress]
  );

  const forceTickRun = useCallback(
    (runId: number) => {
      void pollRunProgress(runId, true);
    },
    [pollRunProgress]
  );

  async function deleteHistoryRun(r: RunRow) {
    const when = new Date(r.created_at).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    const ok = window.confirm(
      `Excluir do histórico a execução de ${r.uf} em ${when}?\n\nSerão removidos os dados desta execução na fila ANP. Clientes já cadastrados no CRM não são apagados.`
    );
    if (!ok) return;
    setError(null);
    const res = await fetch(`/api/admin/lead-generation/runs/${r.id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Não foi possível excluir");
      return;
    }
    if (activeRunId === r.id) {
      setActiveRunId(null);
      setActiveRun(null);
    }
    if (summaryRunId === r.id) setSummaryRunId(null);
    void loadMeta();
  }

  const counts = shownRun?.counts_json ?? {};

  const showBackgroundBanner =
    shownRun != null && !execOverlayOpen && (backgroundRunNotice || shownRunActive);

  return (
    <div>
      {error ? <div className="alert alert-error">{error}</div> : null}

      {summaryRun ? (
        <div className="lead-gen-run-summary-banner" role="region" aria-label="Resumo da execução">
          <div className="lead-gen-run-summary-banner-main">
            <p className="lead-gen-run-summary-banner-title">
              <strong>{summaryRun.uf}</strong> · meta {summaryRun.max_stations} novo
              {summaryRun.max_stations === 1 ? "" : "s"} ·{" "}
              <span className={`lead-gen-status lead-gen-status--${summaryRun.status}`}>
                {RUN_STATUS_LABEL[summaryRun.status] ?? summaryRun.status}
              </span>
              <span className="muted">
                {" "}
                ·{" "}
                {new Date(summaryRun.created_at).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </span>
            </p>
            <p className="lead-gen-run-summary-banner-stats muted">
              {formatRunResults(summaryRun.counts_json ?? {})}
              {" · "}
              ANP {summaryRun.counts_json?.anp_found ?? 0} · processados {summaryRun.counts_json?.processed ?? 0} · novos{" "}
              {summaryRun.counts_json?.created ?? 0}
            </p>
            {summaryRun.error_message ? (
              <p className="lead-gen-run-summary-banner-error muted" title={summaryRun.error_message}>
                {summaryRun.error_message.length > 160
                  ? `${summaryRun.error_message.slice(0, 160)}…`
                  : summaryRun.error_message}
              </p>
            ) : null}
          </div>
          <div className="lead-gen-run-summary-banner-actions">
            <button type="button" className="btn btn-sm btn-primary" onClick={() => openRunVerMais(summaryRun.id)}>
              Ver mais
            </button>
            <button
              type="button"
              className="btn btn-icon-sm lead-gen-run-summary-close"
              aria-label="Fechar resumo"
              onClick={() => setSummaryRunId(null)}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      ) : null}

      {showBackgroundBanner && shownRun ? (
        <div className="lead-gen-bg-banner" role="status">
          <div>
            {shownRunActive ? (
              <>
                Geração em andamento em <strong>segundo plano</strong> ({computeRunProgressPct(shownRun)}% —{" "}
                {runProgressDetail(shownRun)}).
              </>
            ) : (
              <>
                Geração finalizada ({RUN_STATUS_LABEL[shownRun.status] ?? shownRun.status}).{" "}
                {formatRunResults(counts)}
              </>
            )}
          </div>
          <div className="lead-gen-bg-banner-actions">
            <button type="button" className="btn btn-sm btn-primary" onClick={openExecOverlay}>
              {shownRunActive ? "Ver progresso" : "Ver detalhes"}
            </button>
            {!shownRunActive ? (
              <button type="button" className="btn btn-sm" onClick={() => setBackgroundRunNotice(false)}>
                Dispensar
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <LeadGenOverlayLayer>
        <LeadGenAnpPreviewModal
          open={anpPreviewOpen}
          loading={anpPreviewLoading}
          data={anpPreviewData}
          error={anpPreviewError}
          leadsRequested={leadsRequested}
          onClose={() => setAnpPreviewOpen(false)}
          onConfirmStart={() => void startRun()}
          onAdjustMetaToEstimated={(estimated) => void openAnpPreviewModal(estimated)}
          starting={starting}
        />

        {shownRun && execOverlayOpen ? (
          <LeadGenExecutionOverlay
            open
            run={shownRun}
            phaseLine={
              tickBusy && runNeedsLeadGenDrain(shownRun) ? TICK_BUSY_PHASE_LINE : phaseLine
            }
            activity={activityFeed}
            cancelling={cancelling}
            onClose={closeExecOverlay}
            onCancel={() => {
              if (shownRun.id > 0) void cancelRun(shownRun.id);
              else {
                setExecOverlayOpen(false);
                setActiveRun(null);
                setStarting(false);
              }
            }}
            onResume={shownRun.status === "paused" ? () => void resumeRun(shownRun.id) : undefined}
            onRefresh={() => void manualRefreshRun(shownRun.id)}
            onForceTick={() => forceTickRun(shownRun.id)}
            refreshBusy={refreshBusy}
            tickBusy={tickBusy}
            lastRefreshedLabel={lastRefreshedLabel}
          />
        ) : null}
      </LeadGenOverlayLayer>

      <div className="panel">
        <h3 className="panel-title">Parâmetros</h3>
        {quota ? (
          <div className="lead-gen-quota-panel">
            <div className="lead-gen-quota-stat">
              <strong>{quota.available_today}</strong>
              <span>Consultas disponíveis hoje</span>
            </div>
            <div className="lead-gen-quota-stat">
              <strong>{quota.used_today}</strong>
              <span>Usadas hoje</span>
            </div>
            <div className="lead-gen-quota-stat">
              <strong>{quota.daily_limit}</strong>
              <span>Limite diário (Admin)</span>
            </div>
            <div className="lead-gen-quota-stat">
              <strong>{quota.per_run_limit}</strong>
              <span>Máx. por execução (Admin)</span>
            </div>
          </div>
        ) : (
          <p className="muted">Carregando limites…</p>
        )}
        {!quota?.google_configured ? (
          <p className="muted" style={{ marginTop: 0 }}>
            Chave Google Places não configurada: a execução usará só ANP e cadastro, sem enriquecimento Google.
          </p>
        ) : null}

        <div className="lead-gen-form-row lead-gen-form-row--meta">
          <div className="field">
            <label className="label" htmlFor="lead-segment">
              Segmento
            </label>
            <select
              id="lead-segment"
              className="input"
              value={segment}
              disabled={segmentLockedByProduct}
              title={segmentLockedByProduct ? "Definido no cadastro do produto" : undefined}
              onChange={(e) => setSegment(e.target.value)}
            >
              {segmentOptions.map((o) => (
                <option key={o.slug} value={o.slug}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="lead-gen-meta-product-flow">
            <div className="field">
              <label className="label">Produto (opcional)</label>
              <select className="input" value={productId} onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">—</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            {productId !== "" && flowPreview ? <LeadGenFlowField preview={flowPreview} /> : null}
          </div>
          <div className="field">
            <label className="label">BDR responsável</label>
            <select className="input" value={bdrUserId} onChange={(e) => setBdrUserId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Sem responsável</option>
              {bdrs.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="lead-gen-form-section">
          <span className="label">Região</span>
          <AdminNovosLeadsCityPicker
            uf={uf}
            ufOptions={ufOptions}
            onUfChange={setUf}
            allCities={allCities}
            onAllCitiesChange={setAllCities}
            onSelectionChange={setCitySelection}
            productId={productId}
          />
        </div>

        <div className="lead-gen-form-row lead-gen-form-row--start">
          <div className="field lead-gen-qty-field">
            <span className="label" id="lead-gen-qty-label">
              Novos leads a solicitar
            </span>
            <div className="qty-stepper" role="group" aria-labelledby="lead-gen-qty-label">
              <button
                type="button"
                className="qty-stepper-btn"
                aria-label="Diminuir quantidade"
                disabled={starting || leadsRequested <= 1}
                onClick={() => setLeadsRequested((n) => clampLeadsRequested(n - 1))}
              >
                −
              </button>
              <input
                className="input qty-stepper-input"
                type="number"
                min={1}
                max={maxLeadsRequested}
                value={leadsRequested}
                disabled={starting}
                onChange={(e) => setLeadsRequested(clampLeadsRequested(Number(e.target.value)))}
              />
              <button
                type="button"
                className="qty-stepper-btn"
                aria-label="Aumentar quantidade"
                disabled={starting || leadsRequested >= maxLeadsRequested}
                onClick={() => setLeadsRequested((n) => clampLeadsRequested(n + 1))}
              >
                +
              </button>
            </div>
            <span className="muted lead-gen-qty-hint">Máx. {maxLeadsRequested} por execução</span>
          </div>
          <div className="lead-gen-start-actions">
            <button
              className="btn btn-primary lead-gen-start-btn"
              type="button"
              disabled={starting || shownRunActive || anpPreviewLoading}
              onClick={() => void openAnpPreviewModal()}
            >
              {anpPreviewLoading ? (
                "Consultando ANP…"
              ) : (
                <>
                  <Play size={17} strokeWidth={2.5} fill="currentColor" aria-hidden className="lead-gen-start-btn-icon" />
                  Solicitar leads
                </>
              )}
            </button>
            {shownRunActive && shownRun ? (
              <button
                className="btn lead-gen-cancel-exec-btn"
                type="button"
                disabled={cancelling}
                onClick={() => void cancelRun(shownRun.id)}
              >
                {cancelling ? "Cancelando…" : "Cancelar execução"}
              </button>
            ) : null}
          </div>
          <p className="lead-gen-run-note muted" role="note">
            CNPJs já no CRM ou cadastros inválidos são ignorados na geração.
          </p>
        </div>
      </div>

      {shownRun && shownRunActive ? (
        <div className="panel lead-gen-active-panel" style={{ marginTop: "1rem" }}>
          <div className="lead-gen-active-panel-head">
            <h3 className="panel-title">{shownRunActive ? "Execução em andamento" : "Detalhe da execução"}</h3>
            {shownRunActive ? (
              <button
                className="btn lead-gen-cancel-exec-btn"
                type="button"
                disabled={cancelling}
                onClick={() => void cancelRun(shownRun.id)}
              >
                {cancelling ? "Cancelando…" : "Cancelar execução"}
              </button>
            ) : null}
          </div>
          <p>
            Meta: {shownRun.max_stations} novo{shownRun.max_stations === 1 ? "" : "s"} ·{" "}
            {RUN_STATUS_LABEL[shownRun.status] ?? shownRun.status}
            {shownRunActive ? ` · ${PHASE_LABEL[shownRun.phase] ?? shownRun.phase}` : null}
            {shownRun.simulation ? " · Sem Google (sem chave ou quota)" : ""}
          </p>
          {shownRunActive ? <LeadGenRunProgressBar run={shownRun} /> : null}
          {shownRun.error_message ? <p className="alert alert-error">{shownRun.error_message}</p> : null}
          <ul className="muted" style={{ columns: 2, fontSize: "0.9rem" }}>
            <li>ANP: {counts.anp_found ?? 0}</li>
            <li>Itens: {counts.items_total ?? 0}</li>
            <li>Processados: {counts.processed ?? 0}</li>
            <li>Novos: {counts.created ?? 0}</li>
            <li>Já cadastrados: {counts.existing ?? 0}</li>
            <li>Dúvida Google: {counts.ambiguous ?? 0}</li>
            <li>Sem Google: {counts.no_google_match ?? 0}</li>
            <li>Erros: {counts.errors ?? 0}</li>
          </ul>
          {shownRunActive ? (
            <div className="lead-gen-active-actions">
              {shownRun.status === "paused" ? (
                <button className="btn btn-primary" type="button" onClick={() => void resumeRun(shownRun.id)}>
                  Retomar
                </button>
              ) : null}
              <button
                className="btn lead-gen-cancel-exec-btn"
                type="button"
                disabled={cancelling}
                onClick={() => void cancelRun(shownRun.id)}
              >
                {cancelling ? "Cancelando…" : "Cancelar execução"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="panel" style={{ marginTop: "1rem" }}>
        <h3 className="panel-title">Histórico</h3>
        {runs.length === 0 ? (
          <p className="muted">Nenhuma execução ainda.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table lead-gen-history-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Parâmetros</th>
                  <th>Resultado</th>
                  <th>Status</th>
                  <th>Solicitante</th>
                  <th className="lead-gen-history-actions-head" aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const filters = r.filters_json ?? {
                    cities: [],
                    all_cities_in_uf: false,
                    segment: "all"
                  };
                  const geo = formatRunGeo(filters, r.uf);
                  const active = ["queued", "running", "paused"].includes(r.status);
                  const bdrName = r.bdr_user_id ? bdrNameById.get(r.bdr_user_id) : null;
                  const productName = r.product_id ? productNameById.get(r.product_id) : null;
                  const isSelected = summaryRunId === r.id;
                  return (
                    <tr key={r.id} className={isSelected ? "is-selected" : undefined}>
                      <td className="lead-gen-history-when">
                        {new Date(r.created_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </td>
                      <td className="lead-gen-history-params">
                        <span className="lead-gen-history-line">
                          <strong>{r.uf}</strong> ·{" "}
                          {geo.title ? (
                            <span className="lead-gen-history-geo-hint" title={geo.title}>
                              {geo.line}
                            </span>
                          ) : (
                            geo.line
                          )}
                        </span>
                        <span className="lead-gen-history-sub muted">
                          {segmentLabel(filters.segment, segmentOptions)}
                        </span>
                        <span className="lead-gen-history-sub muted">
                          Solicitados: {r.max_stations} novo{r.max_stations === 1 ? "" : "s"}
                          {r.simulation
                            ? " · sem Google"
                            : ` · Google ${r.counts_json?.created ?? 0}/${r.max_google_calls} sucesso${r.max_google_calls === 1 ? "" : "s"}${
                                (r.counts_json?.google_api_attempts ?? 0) > 0
                                  ? ` · ${r.counts_json.google_api_attempts} consulta${r.counts_json.google_api_attempts === 1 ? "" : "s"}`
                                  : ""
                              }`}
                        </span>
                        {bdrName || productName ? (
                          <span className="lead-gen-history-sub muted">
                            {bdrName ? `BDR: ${bdrName}` : null}
                            {bdrName && productName ? " · " : null}
                            {productName ? `Produto: ${productName}` : null}
                          </span>
                        ) : null}
                      </td>
                      <td className="lead-gen-history-result">
                        <div className="lead-gen-history-result-row">
                          <span>
                            {showRunResultColumn(r) ? (
                              formatRunResults(r.counts_json ?? {})
                            ) : active ? (
                              <LeadGenRunProgressBar run={r} compact />
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </span>
                          {showRunResultColumn(r) || active ? (
                            <button
                              type="button"
                              className={`btn btn-icon-sm lead-gen-history-info${isSelected ? " is-active" : ""}`}
                              title="Resumo da execução"
                              aria-label="Resumo da execução"
                              onClick={() => openRunSummary(r.id)}
                            >
                              <Info size={15} aria-hidden />
                            </button>
                          ) : null}
                        </div>
                        {(r.counts_json?.items_total ?? 0) > 0 ? (
                          <span className="lead-gen-history-sub muted">{r.counts_json.items_total} itens ANP</span>
                        ) : null}
                      </td>
                      <td>
                        <span
                          className={`lead-gen-status lead-gen-status--${r.status}`}
                          title={active ? PHASE_LABEL[r.phase] ?? r.phase : undefined}
                        >
                          {RUN_STATUS_LABEL[r.status] ?? r.status}
                        </span>
                        {active ? (
                          <span className="lead-gen-history-sub muted">
                            {computeRunProgressPct(r)}% · {runProgressDetail(r)}
                          </span>
                        ) : null}
                      </td>
                      <td className="muted">{r.requested_by_name ?? "—"}</td>
                      <td className="lead-gen-history-actions">
                        {active ? (
                          <div className="lead-gen-history-active-actions">
                            {r.status === "paused" ? (
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => {
                                  setActiveRunId(r.id);
                                  void resumeRun(r.id);
                                }}
                              >
                                Retomar
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => {
                                setActiveRunId(r.id);
                                void cancelRun(r.id);
                              }}
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-icon-sm lead-gen-history-delete"
                            title="Excluir do histórico"
                            aria-label="Excluir do histórico"
                            onClick={() => void deleteHistoryRun(r)}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
