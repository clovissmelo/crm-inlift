"use client";

import { useCallback, useEffect, useState } from "react";
import type { Product, User } from "@/lib/types";

type Stats = {
  total_clients: number;
  clients_with_verified_phone: number;
  clients_without_approach: number;
  clients_by_bdr: Array<{ bdr_user_id: number | null; bdr_name: string; count: number }>;
  unique_clients_attempted: number;
  approaches_by_channel: Array<{ channel: string; count: number }>;
  call_results: Array<{ result: string; count: number }>;
  pending_returns: number;
  approaches_by_bdr: Array<{ bdr_name: string; count: number }>;
  approaches_series: Array<{ label: string; count: number }>;
  meetings_scheduled: number;
  meetings_confirmed: number;
  meetings_held: number;
  meetings_no_show: number;
  open_opportunities: number;
  proposals_sent: number;
  deals_converted: number;
  open_count_basis: string;
  proposals_sent_basis: string;
  converted_basis: string;
  activity_metrics_available: boolean;
};

export function DashboardView({
  products,
  bdrs
}: {
  products: Product[];
  bdrs: User[];
}) {
  const [productId, setProductId] = useState("");
  const [bdrUserId, setBdrUserId] = useState("");
  const [period, setPeriod] = useState("all");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (productId) params.set("product_id", productId);
    if (bdrUserId) params.set("bdr_user_id", bdrUserId);
    params.set("period", period);
    const res = await fetch(`/api/dashboard/stats?${params.toString()}`);
    if (!res.ok) {
      setError("Não foi possível carregar indicadores.");
      setLoading(false);
      return;
    }
    setStats((await res.json()) as Stats);
    setLoading(false);
  }, [productId, bdrUserId, period]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Dashboard</h1>
      <div className="filters-row">
        <div className="field">
          <label className="label">Produto</label>
          <select className="select" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Todos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">BDR</label>
          <select className="select" value={bdrUserId} onChange={(e) => setBdrUserId(e.target.value)}>
            <option value="">Todas</option>
            {bdrs.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Período</label>
          <select className="select" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="today">Hoje</option>
            <option value="yesterday">Ontem</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="all">Tudo</option>
          </select>
        </div>
      </div>

      {loading ? <p className="muted">Carregando…</p> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      {stats && !loading ? (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="muted">Total de clientes</div>
              <div className="stat-value">{stats.total_clients}</div>
            </div>
            <div className="stat-card">
              <div className="muted">Com número verificado</div>
              <div className="stat-value">{stats.clients_with_verified_phone}</div>
            </div>
            <div className="stat-card">
              <div className="muted">Sem abordagem</div>
              <div className="stat-value">{stats.clients_without_approach}</div>
            </div>
            <div className="stat-card">
              <div className="muted">Clientes tentados (período)</div>
              <div className="stat-value">{stats.unique_clients_attempted}</div>
            </div>
            <div className="stat-card">
              <div className="muted">Retornos pendentes</div>
              <div className="stat-value">{stats.pending_returns}</div>
            </div>
            <div className="stat-card">
              <div className="muted">Reuniões agendadas / confirmadas</div>
              <div className="stat-value">{stats.meetings_scheduled}</div>
              <div className="muted" style={{ fontSize: "0.85rem" }}>
                Confirmadas: {stats.meetings_confirmed}
              </div>
            </div>
            <div className="stat-card">
              <div className="muted">Reuniões realizadas</div>
              <div className="stat-value">{stats.meetings_held}</div>
            </div>
            <div className="stat-card">
              <div className="muted">Não comparecimentos</div>
              <div className="stat-value">{stats.meetings_no_show}</div>
            </div>
            <div className="stat-card">
              <div className="muted">Oportunidades abertas</div>
              <div className="stat-value">{stats.open_opportunities}</div>
              <div className="muted" style={{ fontSize: "0.75rem" }}>{stats.open_count_basis}</div>
            </div>
            <div className="stat-card">
              <div className="muted">Propostas enviadas</div>
              <div className="stat-value">{stats.proposals_sent}</div>
              <div className="muted" style={{ fontSize: "0.75rem" }}>{stats.proposals_sent_basis}</div>
            </div>
            <div className="stat-card">
              <div className="muted">Negócios convertidos</div>
              <div className="stat-value">{stats.deals_converted}</div>
              <div className="muted" style={{ fontSize: "0.75rem" }}>{stats.converted_basis}</div>
            </div>
          </div>

          {stats.activity_metrics_available ? (
            <>
              <div className="panel" style={{ marginTop: "1rem" }}>
                <h3 style={{ marginTop: 0 }}>Abordagens por canal</h3>
                <ul>
                  {stats.approaches_by_channel.map((r) => (
                    <li key={r.channel}>
                      {r.channel === "call" ? "Ligação" : r.channel === "whatsapp" ? "WhatsApp" : "E-mail"}: {r.count}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="panel">
                <h3 style={{ marginTop: 0 }}>Resultados de ligação</h3>
                <ul>
                  {stats.call_results.map((r) => (
                    <li key={r.result}>
                      {r.result}: {r.count}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="panel">
                <h3 style={{ marginTop: 0 }}>Abordagens por BDR (período)</h3>
                <ul>
                  {stats.approaches_by_bdr.map((r) => (
                    <li key={r.bdr_name}>
                      {r.bdr_name}: {r.count}
                    </li>
                  ))}
                </ul>
              </div>
              {stats.approaches_series.length > 0 ? (
                <div className="panel">
                  <h3 style={{ marginTop: 0 }}>Abordagens no tempo</h3>
                  <ul>
                    {stats.approaches_series.map((p) => (
                      <li key={p.label}>
                        {p.label}: {p.count}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}

          <div className="panel" style={{ marginTop: "1rem" }}>
            <h3 style={{ marginTop: 0 }}>Clientes por BDR</h3>
            {stats.clients_by_bdr.length === 0 ? (
              <p className="muted">Nenhum cliente cadastrado com os filtros atuais.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>BDR</th>
                      <th>Clientes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.clients_by_bdr.map((row) => (
                      <tr key={`${row.bdr_user_id}-${row.bdr_name}`}>
                        <td>{row.bdr_name}</td>
                        <td>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {!stats.activity_metrics_available ? (
            <p className="muted" style={{ marginTop: "1rem" }}>
              Métricas de atividade por período serão exibidas quando houver registros de abordagens e retornos.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
