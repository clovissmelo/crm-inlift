"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { FilterBar, FilterBarButton, FilterInput, FilterSelect } from "@/components/filter-bar";
import { PageIntro } from "@/components/page-intro";
import type { Company, Product, User } from "@/lib/types";
import { formatSpDateTime, monthBoundsYmd } from "@/lib/datetime";

export function ConvertedDealsView({
  products,
  bdrs,
  users,
  companies
}: {
  products: Product[];
  bdrs: User[];
  users: User[];
  companies: Company[];
}) {
  const defaultRange = useMemo(() => monthBoundsYmd(), []);
  const [closedFrom, setClosedFrom] = useState(defaultRange.from);
  const [closedTo, setClosedTo] = useState(defaultRange.to);
  const [productId, setProductId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [bdrId, setBdrId] = useState("");
  const [closerId, setCloserId] = useState("");
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ closed_from: closedFrom, closed_to: closedTo });
    if (productId) params.set("product_id", productId);
    if (companyId) params.set("company_id", companyId);
    if (bdrId) params.set("origin_bdr_user_id", bdrId);
    if (closerId) params.set("closer_user_id", closerId);
    const res = await fetch(`/api/conversions?${params}`);
    const data = (await res.json()) as { items: Array<Record<string, unknown>> };
    setItems(data.items ?? []);
  }, [closedFrom, closedTo, productId, companyId, bdrId, closerId]);

  useEffect(() => {
    void load();
  }, [load]);

  function exportCsv() {
    const params = new URLSearchParams({ closed_from: closedFrom, closed_to: closedTo, format: "csv" });
    if (productId) params.set("product_id", productId);
    if (companyId) params.set("company_id", companyId);
    if (bdrId) params.set("origin_bdr_user_id", bdrId);
    if (closerId) params.set("closer_user_id", closerId);
    window.location.href = `/api/conversions?${params}`;
  }

  return (
    <div>
      <PageIntro>Base para comissões futuras — sem cálculo de valores a pagar nesta etapa.</PageIntro>
      <FilterBar>
        <FilterInput
          label="De"
          type="date"
          value={closedFrom}
          onChange={(e) => setClosedFrom(e.target.value)}
        />
        <FilterInput
          label="Até"
          type="date"
          value={closedTo}
          onChange={(e) => setClosedTo(e.target.value)}
        />
        <FilterSelect label="Empresa" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          <option value="">Todas</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Produto" value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Todos</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="BDR origem" value={bdrId} onChange={(e) => setBdrId(e.target.value)}>
          <option value="">Todos</option>
          {bdrs.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Closer" value={closerId} onChange={(e) => setCloserId(e.target.value)}>
          <option value="">Todos</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </FilterSelect>
        <span className="filters-bar-spacer" aria-hidden />
        <FilterBarButton accent onClick={exportCsv}>
          <Download size={14} aria-hidden />
          Exportar CSV
        </FilterBarButton>
      </FilterBar>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Empresa</th>
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
                <td>{String(r.company_name ?? "—")}</td>
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
