"use client";

import { useCallback, useEffect, useState } from "react";
import { FilterBar, FilterInput, FilterSelect } from "@/components/filter-bar";
import { PageIntro } from "@/components/page-intro";
import { formatCnpj } from "@/lib/format";
import type { ClientListItem, User } from "@/lib/types";

export function OrganizacaoLeadsView({ bdrs, products }: { bdrs: User[]; products: Array<{ id: number; name: string }> }) {
  const [items, setItems] = useState<ClientListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectAllResults, setSelectAllResults] = useState(false);
  const [toBdr, setToBdr] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    const res = await fetch(`/api/clients?${params.toString()}`);
    const data = (await res.json()) as { items: ClientListItem[]; total: number };
    setItems(data.items);
    setTotal(data.total);
    setLoading(false);
  }, [filters, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(id: number) {
    setSelectAllResults(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePageAll(checked: boolean) {
    setSelectAllResults(false);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of items) {
        if (checked) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  }

  const selectedCount = selectAllResults ? total : selected.size;
  const targetBdrName = bdrs.find((b) => String(b.id) === toBdr)?.name ?? "";
  const productNameById = new Map(products.map((p) => [p.id, p.name]));

  function formatProducts(productIds: number[]) {
    if (!productIds.length) return "—";
    return productIds.map((id) => productNameById.get(id) ?? `#${id}`).join(", ");
  }

  async function executeTransfer() {
    setMessage(null);
    setError(null);
    const res = await fetch("/api/clients/bulk-bdr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to_bdr_user_id: Number(toBdr),
        select_all: selectAllResults,
        client_ids: selectAllResults ? undefined : [...selected],
        filters: selectAllResults ? filters : undefined
      })
    });
    const data = (await res.json()) as { error?: string; updated?: number };
    if (!res.ok) {
      setError(data.error ?? "Falha na transferência");
      return;
    }
    setMessage(`${data.updated ?? 0} cliente(s) transferido(s) para ${targetBdrName}.`);
    setConfirmOpen(false);
    setSelected(new Set());
    setSelectAllResults(false);
    void load();
  }

  return (
    <div>
      <PageIntro>Filtre, selecione clientes e transfira a BDR responsável em lote.</PageIntro>

      <FilterBar>
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
        <FilterSelect label="BDR atual" value={filters.bdr_user_id} onChange={(e) => setFilters((f) => ({ ...f, bdr_user_id: e.target.value }))}>
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
      </FilterBar>

      <div className="panel organizacao-bulk-bar">
        <div className="field organizacao-bulk-bar-field">
          <label className="label" htmlFor="organizacao-new-bdr">
            Nova BDR responsável
          </label>
          <select
            id="organizacao-new-bdr"
            className="select"
            value={toBdr}
            onChange={(e) => setToBdr(e.target.value)}
          >
            <option value="">Selecione</option>
            {bdrs.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="organizacao-bulk-bar-actions">
          <button
            className="btn btn-primary"
            type="button"
            disabled={!toBdr || selectedCount === 0}
            onClick={() => setConfirmOpen(true)}
          >
            Transferir selecionados
          </button>
          <label className="organizacao-bulk-select-all">
            <input
              type="checkbox"
              checked={selectAllResults}
              onChange={(e) => {
                setSelectAllResults(e.target.checked);
                if (e.target.checked) setSelected(new Set());
              }}
            />
            <span>Selecionar todos os {total} resultados do filtro</span>
          </label>
        </div>
      </div>

      {message ? <div className="alert alert-info">{message}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="panel table-wrap">
        {loading ? <p className="muted">Carregando…</p> : null}
        {!loading && items.length === 0 ? <p className="muted">Nenhum cliente encontrado.</p> : null}
        {items.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Selecionar página"
                    onChange={(e) => togglePageAll(e.target.checked)}
                    checked={items.length > 0 && items.every((i) => selected.has(i.id) || selectAllResults)}
                  />
                </th>
                <th>Empresa</th>
                <th>CNPJ</th>
                <th>Produto</th>
                <th>Cidade</th>
                <th>UF</th>
                <th>Segmento</th>
                <th>BDR</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectAllResults || selected.has(item.id)}
                      disabled={selectAllResults}
                      onChange={() => toggle(item.id)}
                    />
                  </td>
                  <td>{item.trade_name || item.legal_name}</td>
                  <td>{formatCnpj(item.cnpj)}</td>
                  <td>{formatProducts(item.product_ids)}</td>
                  <td>{item.city ?? "—"}</td>
                  <td>{item.uf ?? "—"}</td>
                  <td>{item.segment ?? "—"}</td>
                  <td>{item.bdr_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <button className="btn" type="button" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - limit))}>
          Anterior
        </button>
        <button className="btn" type="button" disabled={offset + limit >= total} onClick={() => setOffset((o) => o + limit)}>
          Próxima
        </button>
      </div>

      {confirmOpen ? (
        <div className="panel" style={{ marginTop: "1rem", borderColor: "#404040" }}>
          <p>
            Confirmar transferência de <strong>{selectedCount}</strong> cliente(s) para <strong>{targetBdrName}</strong>?
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn btn-primary" type="button" onClick={() => void executeTransfer()}>
              Confirmar
            </button>
            <button className="btn" type="button" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
