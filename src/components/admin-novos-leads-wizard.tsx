"use client";

import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { useCallback, useEffect, useMemo, useState } from "react";

const UFS = ["RS", "PR"] as const;

type Preview = {
  estimated_total: number;
  unique_cnpjs: number;
  existing_in_crm: number;
  new_estimated: number;
  cities_scanned: number;
  cities_total: number;
  preview_complete: boolean;
  google_enrichment_available: boolean;
  unavailable_without_google: string[];
};

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

const PHASE_LABEL: Record<string, string> = {
  anp_load: "Carregando ANP",
  processing: "Processando postos",
  finalizing: "Finalizando",
  done: "Concluído"
};

export function AdminNovosLeadsWizard() {
  const [uf, setUf] = useState<(typeof UFS)[number]>("RS");
  const [allCities, setAllCities] = useState(false);
  const [cityInput, setCityInput] = useState("");
  const [segment, setSegment] = useState<"all" | "white_flag_only">("all");
  const [maxStations, setMaxStations] = useState(50);
  const [maxGoogle, setMaxGoogle] = useState(50);
  const [simulation, setSimulation] = useState(true);
  const [ackCharges, setAckCharges] = useState(false);
  const [bdrUserId, setBdrUserId] = useState<number | "">("");
  const [productId, setProductId] = useState<number | "">("");

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [activeRun, setActiveRun] = useState<RunDetail | null>(null);
  const [resultTab, setResultTab] = useState<"created" | "existing" | "ambiguous" | "errors">("created");
  const [resultItems, setResultItems] = useState<Array<{ id: number; cnpj: string; client_id: number | null; status: string; error_message: string | null }>>([]);

  const [bdrs, setBdrs] = useState<Array<{ id: number; name: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: number; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const cities = useMemo(
    () =>
      cityInput
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [cityInput]
  );

  const loadMeta = useCallback(async () => {
    const [uRes, pRes, rRes] = await Promise.all([
      fetch("/api/users"),
      fetch("/api/products"),
      fetch("/api/admin/lead-generation/runs")
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

  async function runPreview() {
    setPreviewLoading(true);
    setError(null);
    setPreview(null);
    const res = await fetch("/api/admin/lead-generation/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uf,
        cities,
        all_cities_in_uf: allCities,
        segment,
        max_stations: maxStations
      })
    });
    const data = (await res.json()) as Preview & { error?: string };
    setPreviewLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Falha na prévia");
      return;
    }
    setPreview(data);
  }

  async function startRun() {
    if (!simulation && !ackCharges) {
      setError("Confirme cobranças de API ou ative simulação.");
      return;
    }
    setStarting(true);
    setError(null);
    const res = await fetch("/api/admin/lead-generation/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uf,
        cities,
        all_cities_in_uf: allCities,
        segment,
        max_stations: maxStations,
        max_google_calls: simulation ? 0 : maxGoogle,
        simulation,
        acknowledge_charges: ackCharges,
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

      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          void runPreview();
        }}
      >
        <h3 className="panel-title">A. Parâmetros</h3>
        <div className="filters-row">
          <div className="field">
            <label className="label">UF</label>
            <select className="input" value={uf} onChange={(e) => setUf(e.target.value as (typeof UFS)[number])}>
              {UFS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Máx. postos</label>
            <input className="input" type="number" min={1} max={500} value={maxStations} onChange={(e) => setMaxStations(Number(e.target.value))} />
          </div>
          <div className="field">
            <label className="label">Máx. consultas Google</label>
            <input
              className="input"
              type="number"
              min={0}
              max={500}
              disabled={simulation}
              value={maxGoogle}
              onChange={(e) => setMaxGoogle(Number(e.target.value))}
            />
          </div>
        </div>
        <label style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input type="checkbox" checked={allCities} onChange={(e) => setAllCities(e.target.checked)} />
          <span>Todas as cidades mapeadas da UF</span>
        </label>
        {!allCities ? (
          <div className="field">
            <label className="label">Cidades (nome oficial, vírgula ou linha)</label>
            <textarea className="textarea" value={cityInput} onChange={(e) => setCityInput(e.target.value)} placeholder="Porto Alegre, Canoas" />
          </div>
        ) : null}
        <div className="field">
          <label className="label">Segmento (ANP)</label>
          <select className="input" value={segment} onChange={(e) => setSegment(e.target.value as "all" | "white_flag_only")}>
            <option value="all">Todos os postos</option>
            <option value="white_flag_only">Somente bandeira branca / sem bandeira</option>
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
        <label style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input type="checkbox" checked={simulation} onChange={(e) => setSimulation(e.target.checked)} />
          <span>Simulação (ANP + cadastro; sem Google Places)</span>
        </label>
        {!simulation ? (
          <label style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input type="checkbox" checked={ackCharges} onChange={(e) => setAckCharges(e.target.checked)} />
            <span>Entendo possíveis cobranças do Google Places.</span>
          </label>
        ) : null}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" type="submit" disabled={previewLoading}>
            {previewLoading ? "Calculando…" : "Prévia ANP"}
          </button>
          <button className="btn btn-primary" type="button" disabled={starting} onClick={() => void startRun()}>
            {starting ? "Iniciando…" : "Iniciar geração"}
          </button>
        </div>
      </form>

      {preview ? (
        <div className="panel" style={{ marginTop: "1rem" }}>
          <h3 className="panel-title">Prévia</h3>
          <p>
            Estimativa: <strong>{preview.unique_cnpjs}</strong> CNPJs · Já no CRM: <strong>{preview.existing_in_crm}</strong> · Novos
            estimados: <strong>{preview.new_estimated}</strong>
          </p>
          <p className="muted">
            Cidades na amostra: {preview.cities_scanned}/{preview.cities_total}
            {!preview.preview_complete ? " (amostra parcial — contagem exata ao iniciar a execução)" : ""}
          </p>
          {!preview.google_enrichment_available ? (
            <p className="muted">Sem chave Google: {preview.unavailable_without_google.join("; ")}</p>
          ) : null}
        </div>
      ) : null}

      {activeRun ? (
        <div className="panel" style={{ marginTop: "1rem" }}>
          <h3 className="panel-title">B. Execução #{activeRun.id}</h3>
          <p>
            {PHASE_LABEL[activeRun.phase] ?? activeRun.phase} · Status: {activeRun.status} · Progresso: {activeRun.progress_pct}%
            {activeRun.simulation ? " · Simulação" : ""}
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
              <h4>C. Resultados</h4>
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
