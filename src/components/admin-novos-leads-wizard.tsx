"use client";

import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import {
  AdminNovosLeadsCityPicker,
  type CitySelectionPayload,
  type UfOption
} from "@/components/admin-novos-leads-city-picker";
import { LEAD_GEN_SEGMENT_OPTIONS, type LeadGenSegmentFilter } from "@/lib/lead-motor/lead-gen-segments";
import { useCallback, useEffect, useState } from "react";

type RunRow = {
  id: number;
  status: string;
  phase: string;
  uf: string;
  simulation: boolean;
  progress_pct: number;
  counts_json: Record<string, number>;
  error_message: string | null;
  created_at: string;
  requested_by_name?: string;
};

type RunDetail = RunRow & {
  filters_json?: { cities: string[]; all_cities_in_uf: boolean; segment: string };
};

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

export function AdminNovosLeadsWizard() {
  const [ufOptions, setUfOptions] = useState<UfOption[]>([]);
  const [uf, setUf] = useState("RS");
  const [allCities, setAllCities] = useState(false);
  const [citySelection, setCitySelection] = useState<CitySelectionPayload>({ regions: [], cities: [] });
  const [segment, setSegment] = useState<LeadGenSegmentFilter>("all");
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

  const hasGeoSelection = allCities || citySelection.regions.length > 0 || citySelection.cities.length > 0;

  const loadMeta = useCallback(async () => {
    const [uRes, pRes, rRes, geoRes, quotaRes] = await Promise.all([
      fetch("/api/users"),
      fetch("/api/products"),
      fetch("/api/admin/lead-generation/runs"),
      fetch("/api/admin/lead-generation/geo"),
      fetch("/api/admin/lead-generation/quota")
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
      setQuota((await quotaRes.json()) as QuotaPanel);
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const fetchRunDetail = useCallback(
    async (id: number, tab?: typeof resultTab) => {
      const q = tab ? `?tab=${tab}` : "";
      const res = await fetch(`/api/admin/lead-generation/runs/${id}${q}`);
      if (!res.ok) return;
      const data = (await res.json()) as { run: RunDetail; items?: typeof resultItems };
      setActiveRun(data.run);
      if (data.items) setResultItems(data.items as typeof resultItems);
    },
    []
  );

  useEffect(() => {
    if (!activeRunId) return;
    void fetchRunDetail(activeRunId);
    const t = setInterval(() => {
      void fetchRunDetail(activeRunId);
      if (["completed", "failed", "cancelled"].includes(activeRun?.status ?? "")) return;
    }, 4000);
    return () => clearInterval(t);
  }, [activeRunId, fetchRunDetail, activeRun?.status]);

  useEffect(() => {
    if (activeRunId && ["completed", "failed", "cancelled"].includes(activeRun?.status ?? "")) {
      void fetchRunDetail(activeRunId, resultTab);
    }
  }, [activeRunId, activeRun?.status, resultTab, fetchRunDetail]);

  async function startRun() {
    if (!allCities && !hasGeoSelection) {
      setError("Selecione UF, zona e/ou cidades (ou todas da UF).");
      return;
    }
    setStarting(true);
    setError(null);
    const res = await fetch("/api/admin/lead-generation/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uf,
        cities: citySelection.cities,
        regions: citySelection.regions,
        all_cities_in_uf: allCities,
        segment,
        bdr_user_id: bdrUserId === "" ? null : bdrUserId,
        product_id: productId === "" ? null : productId
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

  async function cancelRun() {
    if (!activeRunId) return;
    await fetch(`/api/admin/lead-generation/runs/${activeRunId}/cancel`, { method: "POST" });
    void fetchRunDetail(activeRunId);
    void loadMeta();
  }

  async function resumeRun() {
    if (!activeRunId) return;
    await fetch(`/api/admin/lead-generation/runs/${activeRunId}/resume`, { method: "POST" });
    void fetchRunDetail(activeRunId);
  }

  const counts = activeRun?.counts_json ?? {};

  return (
    <div>
      <PageIntro>
        Geração de postos via ANP (motor PostoCred). O processamento roda em segundo plano no servidor — você pode sair e voltar depois.{" "}
        <Link href="/admin/integracoes/google-places">Google Places</Link> (Admin → card Google Places).
      </PageIntro>

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

        <div className="lead-gen-form-section">
          <span className="label">Região</span>
          <AdminNovosLeadsCityPicker
            uf={uf}
            ufOptions={ufOptions}
            onUfChange={setUf}
            allCities={allCities}
            onAllCitiesChange={setAllCities}
            onSelectionChange={setCitySelection}
          />
        </div>

        <div className="lead-gen-form-section field">
          <label className="label" htmlFor="lead-segment">
            Segmento
          </label>
          <select
            id="lead-segment"
            className="input"
            value={segment}
            onChange={(e) => setSegment(e.target.value as LeadGenSegmentFilter)}
          >
            {LEAD_GEN_SEGMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="filters-row">
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

        <button className="btn btn-primary" type="button" disabled={starting} onClick={() => void startRun()}>
          {starting ? "Iniciando…" : "Iniciar geração"}
        </button>
      </div>

      {activeRun ? (
        <div className="panel" style={{ marginTop: "1rem" }}>
          <h3 className="panel-title">Execução #{activeRun.id}</h3>
          <p>
            {PHASE_LABEL[activeRun.phase] ?? activeRun.phase} · Status: {activeRun.status} · Progresso: {activeRun.progress_pct}%
            {activeRun.simulation ? " · Sem Google (sem chave ou quota)" : ""}
          </p>
          {activeRun.error_message ? <p className="alert alert-error">{activeRun.error_message}</p> : null}
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
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {activeRun.status === "paused" ? (
              <button className="btn btn-primary" type="button" onClick={() => void resumeRun()}>
                Retomar
              </button>
            ) : null}
            {["queued", "running", "paused"].includes(activeRun.status) ? (
              <button className="btn" type="button" onClick={() => void cancelRun()}>
                Cancelar
              </button>
            ) : null}
          </div>

          {["completed", "failed", "cancelled"].includes(activeRun.status) ? (
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
                      void fetchRunDetail(activeRun.id, t);
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
        <ul>
          {runs.map((r) => (
            <li key={r.id}>
              <button type="button" className="link-btn" onClick={() => setActiveRunId(r.id)}>
                #{r.id}
              </button>{" "}
              {r.uf} · {r.status} · {new Date(r.created_at).toLocaleString("pt-BR")} · {r.progress_pct}%
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
