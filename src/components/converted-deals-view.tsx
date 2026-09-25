"use client";

import { useCallback, useEffect, useState } from "react";
import type { Product, User } from "@/lib/types";
import { formatSpDateTime } from "@/lib/datetime";

export function ConvertedDealsView({ products, bdrs, users }: { products: Product[]; bdrs: User[]; users: User[] }) {
  const [period, setPeriod] = useState("30d");
  const [productId, setProductId] = useState("");
  const [bdrId, setBdrId] = useState("");
  const [closerId, setCloserId] = useState("");
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ period });
    if (productId) params.set("product_id", productId);
    if (bdrId) params.set("origin_bdr_user_id", bdrId);
    if (closerId) params.set("closer_user_id", closerId);
    const res = await fetch(`/api/conversions?${params}`);
    const data = (await res.json()) as { items: Array<Record<string, unknown>> };
    setItems(data.items ?? []);
  }, [period, productId, bdrId, closerId]);

  useEffect(() => {
    void load();
  }, [load]);

  function exportCsv() {
    const params = new URLSearchParams({ period, format: "csv" });
    if (productId) params.set("product_id", productId);
    if (bdrId) params.set("origin_bdr_user_id", bdrId);
    if (closerId) params.set("closer_user_id", closerId);
    window.location.href = `/api/conversions?${params}`;
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Negócios convertidos</h1>
      <p className="muted">Base para comissões futuras — sem cálculo de valores a pagar nesta etapa.</p>
      <div className="filters-row">
        <div className="field">
          <label className="label">Período (fechamento)</label>
          <select className="select" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="30d">30 dias</option>
            <option value="7d">7 dias</option>
            <option value="all">Tudo</option>
          </select>
        </div>
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
          <label className="label">BDR origem</label>
          <select className="select" value={bdrId} onChange={(e) => setBdrId(e.target.value)}>
            <option value="">Todos</option>
            {bdrs.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Closer</label>
          <select className="select" value={closerId} onChange={(e) => setCloserId(e.target.value)}>
            <option value="">Todos</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn-primary" onClick={exportCsv}>
          Exportar CSV
        </button>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Produto</th>
              <th>Closer</th>
              <th>Fechamento</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={String(r.opportunity_id)}>
                <td>{String(r.client_name)}</td>
                <td>{String(r.product_name)}</td>
                <td>{String(r.closer_name)}</td>
                <td>{formatSpDateTime(String(r.closed_at))}</td>
                <td>{r.deal_value_tbd ? "A definir" : r.deal_value ? `R$ ${r.deal_value}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
