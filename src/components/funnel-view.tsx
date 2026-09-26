"use client";

import { useCallback, useEffect, useState } from "react";
import { FilterBar, FilterSelect } from "@/components/filter-bar";
import type { Product, User } from "@/lib/types";

type FunnelStats = {
  unique_clients_attempted: number;
  unique_clients_spoken: number;
  unique_clients_meeting_scheduled: number;
};

export function FunnelView({ products, bdrs }: { products: Product[]; bdrs: User[] }) {
  const [period, setPeriod] = useState("30d");
  const [productId, setProductId] = useState("");
  const [bdrUserId, setBdrUserId] = useState("");
  const [stats, setStats] = useState<FunnelStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ period });
    if (productId) params.set("product_id", productId);
    if (bdrUserId) params.set("bdr_user_id", bdrUserId);
    const res = await fetch(`/api/funnel/stats?${params}`);
    if (res.ok) setStats((await res.json()) as FunnelStats);
    setLoading(false);
  }, [period, productId, bdrUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Funil de prospecção</h1>
      <p className="muted">Contagens com base em abordagens e reuniões registradas (reuniões canceladas não entram como realizadas).</p>
      <FilterBar>
        <FilterSelect label="Período" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="today">Hoje</option>
          <option value="7d">7 dias</option>
          <option value="30d">30 dias</option>
          <option value="all">Tudo</option>
        </FilterSelect>
        <FilterSelect label="Produto" value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Todos</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="BDR" value={bdrUserId} onChange={(e) => setBdrUserId(e.target.value)}>
          <option value="">Todos</option>
          {bdrs.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </FilterSelect>
      </FilterBar>
      {loading ? <p className="muted">Carregando…</p> : null}
      {stats && !loading ? (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="muted">Clientes com tentativa de abordagem</div>
            <div className="stat-value">{stats.unique_clients_attempted}</div>
          </div>
          <div className="stat-card">
            <div className="muted">Clientes com quem se falou</div>
            <div className="stat-value">{stats.unique_clients_spoken}</div>
          </div>
          <div className="stat-card">
            <div className="muted">Clientes com reunião agendada</div>
            <div className="stat-value">{stats.unique_clients_meeting_scheduled}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
