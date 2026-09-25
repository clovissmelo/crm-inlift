"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Product, User } from "@/lib/types";
import type { ProspeccaoListItem } from "@/lib/prospeccao-query";

export function ProspeccaoListView({
  initialItems,
  initialTotal,
  products,
  bdrs
}: {
  initialItems: ProspeccaoListItem[];
  initialTotal: number;
  products: Product[];
  bdrs: User[];
}) {
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    city: "",
    uf: "",
    segment: "",
    product_id: "",
    bdr_user_id: "",
    phone_availability: "",
    search: ""
  });
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    const res = await fetch(`/api/prospeccao?${params}`);
    const data = (await res.json()) as { items: ProspeccaoListItem[]; total: number };
    setItems(data.items);
    setTotal(data.total);
    setLoading(false);
  }, [filters, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Leads para prospecção</h1>
      <p className="muted">Prioridade: retornos atrasados, retornos de hoje, demais leads.</p>
      <div className="filters-row">
        <div className="field">
          <label className="label">Busca</label>
          <input className="input" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
        </div>
        <div className="field">
          <label className="label">Produto</label>
          <select className="select" value={filters.product_id} onChange={(e) => setFilters((f) => ({ ...f, product_id: e.target.value }))}>
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
          <select className="select" value={filters.bdr_user_id} onChange={(e) => setFilters((f) => ({ ...f, bdr_user_id: e.target.value }))}>
            <option value="">Todas</option>
            {bdrs.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Telefone</label>
          <select className="select" value={filters.phone_availability} onChange={(e) => setFilters((f) => ({ ...f, phone_availability: e.target.value }))}>
            <option value="">Qualquer</option>
            <option value="mobile">Celular</option>
            <option value="landline">Fixo</option>
            <option value="none">Sem telefone</option>
          </select>
        </div>
      </div>

      <div className="panel table-wrap">
        {loading ? <p className="muted">Carregando…</p> : null}
        <table className="data-table">
          <thead>
            <tr>
              <th>Prioridade</th>
              <th>Empresa</th>
              <th>Cidade/UF</th>
              <th>BDR</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.queue_label === "Atrasado" ? <span className="badge badge-overdue">Atrasado</span> : null}
                  {item.queue_label === "Retorno para hoje" ? <span className="badge badge-today">Retorno para hoje</span> : null}
                  {!item.queue_label ? <span className="muted">—</span> : null}
                </td>
                <td>
                  <Link href={`/clientes/${item.id}`}>{item.trade_name || item.legal_name || `#${item.id}`}</Link>
                </td>
                <td>{[item.city, item.uf].filter(Boolean).join(" / ") || "—"}</td>
                <td>{item.bdr_name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        {total} registro(s) · página {Math.floor(offset / limit) + 1}
      </p>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button className="btn" type="button" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - limit))}>
          Anterior
        </button>
        <button className="btn" type="button" disabled={offset + limit >= total} onClick={() => setOffset((o) => o + limit)}>
          Próxima
        </button>
      </div>
    </div>
  );
}
