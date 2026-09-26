"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FilterBar, FilterInput, FilterSelect } from "@/components/filter-bar";
import { LeadQualificationBadge } from "@/components/lead-qualification-picker";
import { LEAD_QUALIFICATION_LABELS, LEAD_QUALIFICATION_ORDER } from "@/lib/lead-qualification";
import { formatCnpj } from "@/lib/format";
import type { ClientListItem, Product, User } from "@/lib/types";

type Props = {
  title: string;
  initialItems: ClientListItem[];
  initialTotal: number;
  products: Product[];
  bdrs: User[];
  defaultFilters?: {
    without_approach?: boolean;
  };
};

export function ClientListView({ title, initialItems, initialTotal, products, bdrs, defaultFilters }: Props) {
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    city: "",
    uf: "",
    segment: "",
    product_id: "",
    bdr_user_id: "",
    phone_availability: "",
    search: "",
    without_approach: defaultFilters?.without_approach ? "1" : "",
    lead_qualification: ""
  });
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    const res = await fetch(`/api/clients?${params.toString()}`);
    if (!res.ok) {
      setError("Erro ao carregar clientes.");
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { items: ClientListItem[]; total: number };
    setItems(data.items);
    setTotal(data.total);
    setLoading(false);
  }, [filters, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>{title}</h1>
      <FilterBar>
        <FilterInput
          label="Busca"
          className="filter-chip-grow"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          placeholder="Nome, CNPJ…"
        />
        <FilterInput label="Cidade" value={filters.city} onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))} placeholder="—" />
        <FilterInput label="UF" maxLength={2} value={filters.uf} onChange={(e) => setFilters((f) => ({ ...f, uf: e.target.value }))} placeholder="—" />
        <FilterInput label="Segmento" value={filters.segment} onChange={(e) => setFilters((f) => ({ ...f, segment: e.target.value }))} placeholder="—" />
        <FilterSelect label="Produto" value={filters.product_id} onChange={(e) => setFilters((f) => ({ ...f, product_id: e.target.value }))}>
          <option value="">Todos</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="BDR" value={filters.bdr_user_id} onChange={(e) => setFilters((f) => ({ ...f, bdr_user_id: e.target.value }))}>
          <option value="">Todas</option>
          {bdrs.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Telefone" value={filters.phone_availability} onChange={(e) => setFilters((f) => ({ ...f, phone_availability: e.target.value }))}>
          <option value="">Qualquer</option>
          <option value="mobile">Celular</option>
          <option value="landline">Fixo</option>
          <option value="none">Sem telefone</option>
        </FilterSelect>
        <FilterSelect label="Qualificação" value={filters.lead_qualification} onChange={(e) => setFilters((f) => ({ ...f, lead_qualification: e.target.value }))}>
          <option value="">Todas</option>
          {LEAD_QUALIFICATION_ORDER.map((q) => (
            <option key={q} value={q}>
              {LEAD_QUALIFICATION_LABELS[q]}
            </option>
          ))}
        </FilterSelect>
      </FilterBar>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {loading ? <p className="muted">Carregando…</p> : null}

      <div className="panel table-wrap">
        {items.length === 0 && !loading ? <p className="muted">Nenhum cliente encontrado.</p> : null}
        {items.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Qualificação</th>
                <th>CNPJ</th>
                <th>Cidade/UF</th>
                <th>BDR</th>
                <th>Telefone</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/clientes/${item.id}`}>{item.trade_name || item.legal_name || `#${item.id}`}</Link>
                    {item.has_verified_phone ? (
                      <span className="badge badge-verified" style={{ marginLeft: 8 }}>
                        Verificado
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <LeadQualificationBadge value={item.lead_qualification} />
                  </td>
                  <td>{formatCnpj(item.cnpj)}</td>
                  <td>
                    {[item.city, item.uf].filter(Boolean).join(" / ") || "—"}
                  </td>
                  <td>{item.bdr_name ?? "—"}</td>
                  <td>
                    {item.has_mobile ? "Celular" : item.has_landline ? "Fixo" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", alignItems: "center" }}>
        <button className="btn" type="button" disabled={offset === 0 || loading} onClick={() => setOffset((o) => Math.max(0, o - limit))}>
          Anterior
        </button>
        <span className="muted">
          {total === 0 ? "0" : `${offset + 1}–${Math.min(offset + limit, total)}`} de {total}
        </span>
        <button className="btn" type="button" disabled={offset + limit >= total || loading} onClick={() => setOffset((o) => o + limit)}>
          Próxima
        </button>
      </div>
    </div>
  );
}
