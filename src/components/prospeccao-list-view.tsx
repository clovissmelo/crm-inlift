"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClientContactShortcuts } from "@/components/client-contact-shortcuts";
import { ProspeccaoPriorityBadge } from "@/components/prospeccao-priority-badge";
import { FilterBar, FilterInput, FilterSelect } from "@/components/filter-bar";
import { PageIntro } from "@/components/page-intro";
import type { Company, Product, User } from "@/lib/types";
import type { ProspeccaoListItem } from "@/lib/prospeccao-query";

export function ProspeccaoListView({
  initialItems,
  initialTotal,
  products,
  bdrs,
  companies,
  priorityFilters
}: {
  initialItems: ProspeccaoListItem[];
  initialTotal: number;
  products: Product[];
  bdrs: User[];
  companies: Company[];
  priorityFilters: Array<{ slug: string; name: string }>;
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
    prioridade: "",
    company_id: "",
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

  useEffect(() => {
    setOffset(0);
  }, [filters]);

  function updateFilter(patch: Partial<typeof filters>) {
    setFilters((f) => ({ ...f, ...patch }));
  }

  const productNameById = new Map(products.map((p) => [p.id, p.name]));

  function productLabels(productIds: number[]) {
    const names = productIds.map((id) => productNameById.get(id)).filter(Boolean) as string[];
    return names.length ? names.join(", ") : "—";
  }

  return (
    <div>
      <PageIntro>Leads para contato</PageIntro>
      <FilterBar>
        <FilterInput
          label="Busca"
          className="filter-chip-grow"
          value={filters.search}
          onChange={(e) => updateFilter({ search: e.target.value })}
          placeholder="Nome, CNPJ…"
        />
        <FilterSelect label="Prioridade" value={filters.prioridade} onChange={(e) => updateFilter({ prioridade: e.target.value })}>
          <option value="">Todas</option>
          {priorityFilters.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Empresa" value={filters.company_id} onChange={(e) => updateFilter({ company_id: e.target.value })}>
          <option value="">Todas</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Produto" value={filters.product_id} onChange={(e) => updateFilter({ product_id: e.target.value })}>
          <option value="">Todos</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="BDR" value={filters.bdr_user_id} onChange={(e) => updateFilter({ bdr_user_id: e.target.value })}>
          <option value="">Todas</option>
          {bdrs.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Telefone" value={filters.phone_availability} onChange={(e) => updateFilter({ phone_availability: e.target.value })}>
          <option value="">Qualquer</option>
          <option value="mobile">Celular</option>
          <option value="landline">Fixo</option>
          <option value="none">Sem telefone</option>
        </FilterSelect>
      </FilterBar>

      <div className="panel table-wrap">
        {loading ? <p className="muted">Carregando…</p> : null}
        <table className="data-table">
          <thead>
            <tr>
              <th>Prioridade</th>
              <th>Empresa</th>
              <th>Cidade/UF</th>
              <th>BDR</th>
              <th>Produtos</th>
              <th className="prospeccao-col-phone-count">Telefones</th>
              <th style={{ width: 120 }}>Contato</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const displayName = item.trade_name || item.legal_name || `#${item.id}`;
              const productId = item.product_ids[0];
              return (
                <tr key={item.id}>
                  <td>
                    <ProspeccaoPriorityBadge
                      label={item.queue_label}
                      color={item.queue_color}
                      overdueAlert={item.queue_overdue_alert}
                    />
                  </td>
                  <td>
                    <Link href={`/clientes/${item.id}`}>{displayName}</Link>
                  </td>
                  <td>{[item.city, item.uf].filter(Boolean).join(" / ") || "—"}</td>
                  <td>{item.bdr_name ?? "—"}</td>
                  <td>{productLabels(item.product_ids)}</td>
                  <td className="prospeccao-col-phone-count muted prospeccao-col-phone-count__value">
                    {item.contact_phone_count > 0 ? item.contact_phone_count : "—"}
                  </td>
                  <td>
                    <ClientContactShortcuts
                      clientName={displayName}
                      contactName={item.primary_contact_name}
                      phone={item.primary_phone}
                      whatsapp={item.primary_whatsapp}
                      email={item.primary_email}
                      productId={productId}
                      productName={productId ? productNameById.get(productId) : undefined}
                      clientId={item.id}
                      contactId={item.primary_contact_id ?? undefined}
                      size="sm"
                    />
                  </td>
                </tr>
              );
            })}
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
