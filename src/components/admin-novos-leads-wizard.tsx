"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import {
  AdminNovosLeadsCityPicker,
  type CitySelectionPayload,
  type UfOption
} from "@/components/admin-novos-leads-city-picker";
import { computeRunProgressPct, runProgressDetail } from "@/lib/lead-generation/run-progress";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  anp_load: "Carregando ANP",
  processing: "Processando postos",
  finalizing: "Finalizando",
  done: "Concluído"
};

const RUN_STATUS_LABEL: Record<string, string> = {
  queued: "Na fila",
  running: "Em execução",
  paused: "Pausada",
  completed: "Concluída",
  partial: "Parcial",
  failed: "Falhou",
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
  const created = counts.created ?? 0;
  const existing = counts.existing ?? 0;
  const ambiguous = counts.ambiguous ?? 0;
  const errors = counts.errors ?? 0;
  const parts = [`${created} novos`, `${existing} exist.`];
  if (ambiguous > 0) parts.push(`${ambiguous} revisão`);
  if (errors > 0) parts.push(`${errors} erro${errors === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

export function AdminNovosLeadsWizard() {
  const [ufOptions, setUfOptions] = useState<UfOption[]>([]);
  const [uf, setUf] = useState("RS");
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
  const [products, setProducts] = useState<Array<{ id: number; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [leadsRequested, setLeadsRequested] = useState(1);

  const maxLeadsRequested = quota?.per_run_limit ?? 100;

  const listActiveRun = useMemo(
    () => runs.find((r) => ["queued", "running", "paused"].includes(r.status)) ?? null,
    [runs]
  );

  const shownRun = useMemo(() => {
    if (activeRun && listActiveRun && activeRun.id === listActiveRun.id) return activeRun;
    if (activeRun && !listActiveRun) return activeRun;
    return listActiveRun;
  }, [activeRun, listActiveRun]);

  const shownRunActive = shownRun != null && ["queued", "running", "paused"].includes(shownRun.status);

  function clampLeadsRequested(value: number) {
    const max = maxLeadsRequested;
    if (!Number.isFinite(value)) return 1;
    return Math.min(max, Math.max(1, Math.floor(value)));
  }

  const hasGeoSelection = allCities || citySelection.municipalities.length > 0;

  const productNameById = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);
  const bdrNameById = useMemo(() => new Map(bdrs.map((b) => [b.id, b.name])), [bdrs]);

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
      const p = (await pRes.json()) as { products: Array<{ id: number; name: string }> };
      setProducts(p.products ?? []);
    }
    if (rRes.ok) {
      const r = (await rRes.json()) as { runs: RunRow[] };
      setRuns(r.runs ?? []);
      const active = r.runs?.find((x) => ["queued", "running", "paused"].includes(x.status));
      if (active) setActiveRunId(active.id);
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

  const applyRunRow = useCallback((run: RunDetail) => {
    setActiveRun(run);
    setRuns((prev) => prev.map((row) => (row.id === run.id ? { ...row, ...run } : row)));
  }, []);

  const fetchRunDetail = useCallback(
    async (id: number, tab?: typeof resultTab) => {
      const q = tab ? `?tab=${tab}` : "";
      const res = await fetch(`/api/admin/lead-generation/runs/${id}${q}`);
      if (!res.ok) return;
      const data = (await res.json()) as { run: RunDetail; items?: typeof resultItems };
      applyRunRow(data.run);
      if (data.items) setResultItems(data.items as typeof resultItems);
    },
    [applyRunRow]
  );

  const tickActiveRun = useCallback(
    async (id: number) => {
      const res = await fetch(`/api/admin/lead-generation/runs/${id}/tick`, { method: "POST" });
      if (!res.ok) return;
      const data = (await res.json()) as { run: RunDetail };
      applyRunRow(data.run);
    },
    [applyRunRow]
  );

  useEffect(() => {
    if (listActiveRun && activeRunId !== listActiveRun.id) {
      setActiveRunId(listActiveRun.id);
    }
  }, [listActiveRun, activeRunId]);

  useEffect(() => {
    if (!activeRunId) return;
    void tickActiveRun(activeRunId);
    const pollMs = ["queued", "running"].includes(activeRun?.status ?? "") ? 3000 : 4000;
    const t = setInterval(() => {
      void tickActiveRun(activeRunId);
      if (["completed", "partial", "failed", "cancelled"].includes(activeRun?.status ?? "")) return;
    }, pollMs);
    return () => clearInterval(t);
  }, [activeRunId, tickActiveRun, activeRun?.status]);

  useEffect(() => {
    if (activeRunId && ["completed", "partial", "failed", "cancelled"].includes(activeRun?.status ?? "")) {
      void fetchRunDetail(activeRunId, resultTab);
    }
  }, [activeRunId, activeRun?.status, resultTab, fetchRunDetail]);

  async function startRun() {
    if (!allCities && !hasGeoSelection) {
      setError("Selecione UF, zona comercial e/ou cidades (ou todas da UF).");
      return;
    }
    if (productId !== "" && citySelection.municipalities.length > 0) {
      const indRes = await fetch("/api/admin/lead-generation/geo/indicators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uf,
          product_id: productId,
          segment,
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
            `Algumas cidades já tiveram geração para este produto e segmento:\n${lines.join("\n")}${more}\n\nClientes já cadastrados não serão alterados. Deseja continuar?`
          );
          if (!ok) return;
        }
      }
    }
    setStarting(true);
    setError(null);
    const res = await fetch("/api/admin/lead-generation/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uf,
        municipalities: citySelection.municipalities,
        commercial_zone_ids: citySelection.commercial_zone_ids,
        all_cities_in_uf: allCities,
        segment,
        bdr_user_id: bdrUserId === "" ? null : bdrUserId,
        product_id: productId === "" ? null : productId,
        max_stations: clampLeadsRequested(leadsRequested)
      })
    });
    const data = (await res.json()) as { id?: number; error?: string };
    setStarting(false);
    if (!res.ok) {
      setError(data.error ?? "Falha ao iniciar");
      return;
    }
    if (data.id) {
      setActiveRunId(data.id);
      void loadMeta();
    }
  }

  async function cancelRun(runId = activeRunId ?? listActiveRun?.id) {
    if (!runId) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/lead-generation/runs/${runId}/cancel`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Não foi possível cancelar");
        return;
      }
      void tickActiveRun(runId);
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
    void loadMeta();
  }

  const counts = shownRun?.counts_json ?? {};

  return (
    <div>
      {error ? <div className="alert alert-error">{error}</div> : null}

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
            <select id="lead-segment" className="input" value={segment} onChange={(e) => setSegment(e.target.value)}>
              {segmentOptions.map((o) => (
                <option key={o.slug} value={o.slug}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
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
            segment={segment}
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
              className="btn btn-primary"
              type="button"
              disabled={starting || shownRunActive}
              onClick={() => void startRun()}
            >
              {starting ? "Iniciando…" : "Iniciar geração"}
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
          <div className="lead-gen-run-note" role="note">
            Inválidos ou já existentes são ignorados sem repetir CNPJ na execução.
          </div>
        </div>
      </div>

      {shownRun ? (
        <div className="panel lead-gen-active-panel" style={{ marginTop: "1rem" }}>
          <div className="lead-gen-active-panel-head">
            <h3 className="panel-title">Execução em andamento</h3>
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

          {["completed", "partial", "failed", "cancelled"].includes(shownRun.status) ? (
            <div style={{ marginTop: "1rem" }}>
              <h4>Resultados</h4>
              <div className="filters-row" style={{ marginBottom: 8 }}>
                {(["created", "existing", "ambiguous", "errors"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`btn ${resultTab === t ? "btn-primary" : ""}`}
                    onClick={() => {
                      setResultTab(t);
                      void fetchRunDetail(shownRun.id, t);
                    }}
                  >
                    {t === "created" ? "Novos" : t === "existing" ? "Já existentes" : t === "ambiguous" ? "Revisão" : "Erros"}
                  </button>
                ))}
              </div>
              <ul>
                {resultItems.map((item) => (
                  <li key={item.id}>
                    CNPJ {item.cnpj} — {item.status}
                    {item.client_id ? (
                      <>
                        {" "}
                        <Link href={`/clientes/${item.client_id}`}>Abrir ficha</Link>
                      </>
                    ) : null}
                    {item.error_message ? <span className="muted"> ({item.error_message})</span> : null}
                  </li>
                ))}
              </ul>
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
                  const isSelected = activeRunId === r.id;
                  return (
                    <tr key={r.id} className={isSelected ? "is-selected" : undefined}>
                      <td className="lead-gen-history-when">
                        <button type="button" className="link-btn" onClick={() => setActiveRunId(r.id)}>
                          {new Date(r.created_at).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </button>
                      </td>
                      <td className="lead-gen-history-params">
                        <span className="lead-gen-history-line">
                          <strong>{r.uf}</strong> · {geo.line}
                        </span>
                        <span className="lead-gen-history-sub muted" title={geo.title}>
                          {segmentLabel(filters.segment, segmentOptions)}
                        </span>
                        <span className="lead-gen-history-sub muted">
                          Solicitados: {r.max_stations} novo{r.max_stations === 1 ? "" : "s"}
                          {r.simulation ? " · sem Google" : ` · Google ${r.google_calls_used}/${r.max_google_calls}`}
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
                        {(r.counts_json?.processed ?? 0) > 0 || r.status === "completed" ? (
                          formatRunResults(r.counts_json ?? {})
                        ) : active ? (
                          <LeadGenRunProgressBar run={r} compact />
                        ) : (
                          <span className="muted">—</span>
                        )}
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
                        {r.error_message ? (
                          <span className="lead-gen-history-sub lead-gen-history-error" title={r.error_message}>
                            {r.error_message.length > 72 ? `${r.error_message.slice(0, 72)}…` : r.error_message}
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
