"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CadastroModal } from "@/components/cadastro-ui";
import { FilterBar, FilterInput, FilterSelect } from "@/components/filter-bar";
import { PageIntro } from "@/components/page-intro";
import { formatCnpj } from "@/lib/format";
import type { ClientListItem, User } from "@/lib/types";

const defaultFilters = {
  city: "",
  uf: "",
  segment: "",
  product_id: "",
  bdr_user_id: "",
  phone_availability: "",
  phone_contacted: "no",
  created_from: "",
  created_to: "",
  search: ""
};

export function OrganizacaoLeadsView({
  bdrs,
  products,
  isAdmin = false
}: {
  bdrs: User[];
  products: Array<{ id: number; name: string }>;
  isAdmin?: boolean;
}) {
  const [items, setItems] = useState<ClientListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectAllResults, setSelectAllResults] = useState(false);
  const [toBdr, setToBdr] = useState("");
  const [toProduct, setToProduct] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmProductOpen, setConfirmProductOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState(defaultFilters);
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

  useEffect(() => {
    setOffset(0);
    setSelected(new Set());
    setSelectAllResults(false);
  }, [filters]);

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
  const deleteConfirmExpected = useMemo(
    () => (selectedCount > 0 ? `APAGAR ${selectedCount}` : ""),
    [selectedCount]
  );
  const targetBdrName = bdrs.find((b) => String(b.id) === toBdr)?.name ?? "";
  const targetProductName = products.find((p) => String(p.id) === toProduct)?.name ?? "";
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

  async function executeProductLink() {
    setMessage(null);
    setError(null);
    const res = await fetch("/api/clients/bulk-product-opportunity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: Number(toProduct),
        select_all: selectAllResults,
        client_ids: selectAllResults ? undefined : [...selected],
        filters: selectAllResults ? filters : undefined
      })
    });
    const data = (await res.json()) as { error?: string; opportunities_created?: number; product_name?: string };
    if (!res.ok) {
      setError(data.error ?? "Falha ao vincular produto");
      return;
    }
    setMessage(
      `${data.opportunities_created ?? 0} oportunidade(s) criada(s) com ${data.product_name ?? "produto"} (produtos anteriores mantidos).`
    );
    setConfirmProductOpen(false);
    setSelected(new Set());
    setSelectAllResults(false);
    void load();
  }

  function closeDeleteFlow() {
    setDeleteStep(0);
    setDeletePhrase("");
    setDeleteBusy(false);
  }

  async function executeBulkDelete() {
    if (deletePhrase.trim() !== deleteConfirmExpected) return;
    setMessage(null);
    setError(null);
    setDeleteBusy(true);
    const res = await fetch("/api/clients/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        select_all: selectAllResults,
        client_ids: selectAllResults ? undefined : [...selected],
        filters: selectAllResults ? filters : undefined,
        confirm_phrase: deletePhrase.trim()
      })
    });
    const data = (await res.json()) as {
      error?: string;
      deleted?: number;
      failed?: Array<{ id: number; error: string }>;
    };
    setDeleteBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Falha ao apagar leads");
      return;
    }
    const failedCount = data.failed?.length ?? 0;
    if (failedCount > 0) {
      setMessage(
        `${data.deleted ?? 0} lead(s) apagado(s). ${failedCount} não puderam ser excluídos (registros vinculados).`
      );
    } else {
      setMessage(`${data.deleted ?? 0} lead(s) apagado(s) permanentemente.`);
    }
    closeDeleteFlow();
    setSelected(new Set());
    setSelectAllResults(false);
    void load();
  }

  return (
    <div>
      <PageIntro>Vincule ou transfira BDR e/ou produto aos leads.</PageIntro>

      <div className="client-filters-block">
        <FilterBar>
          <FilterInput label="Cidade" value={filters.city} onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))} placeholder="—" />
          <FilterInput label="UF" maxLength={2} value={filters.uf} onChange={(e) => setFilters((f) => ({ ...f, uf: e.target.value }))} placeholder="—" />
          <FilterInput label="Segmento" value={filters.segment} onChange={(e) => setFilters((f) => ({ ...f, segment: e.target.value }))} placeholder="—" />
          <FilterSelect label="Produto" value={filters.product_id} onChange={(e) => setFilters((f) => ({ ...f, product_id: e.target.value }))}>
            <option value="">Todos</option>
            <option value="none">Nenhum</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="BDR atual" value={filters.bdr_user_id} onChange={(e) => setFilters((f) => ({ ...f, bdr_user_id: e.target.value }))}>
            <option value="">Todas</option>
            <option value="none">Nenhum</option>
            {bdrs.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Já telefonado"
            value={filters.phone_contacted}
            onChange={(e) => setFilters((f) => ({ ...f, phone_contacted: e.target.value }))}
          >
            <option value="no">Não (novos)</option>
            <option value="yes">Sim</option>
            <option value="">Todos</option>
          </FilterSelect>
        </FilterBar>
        <FilterBar className="client-filters-more-row">
          <FilterInput
            label="Lead gerado de"
            type="date"
            value={filters.created_from}
            onChange={(e) => setFilters((f) => ({ ...f, created_from: e.target.value }))}
          />
          <FilterInput
            label="Lead gerado até"
            type="date"
            value={filters.created_to}
            onChange={(e) => setFilters((f) => ({ ...f, created_to: e.target.value }))}
          />
          <FilterSelect label="Telefone" value={filters.phone_availability} onChange={(e) => setFilters((f) => ({ ...f, phone_availability: e.target.value }))}>
            <option value="">Qualquer</option>
            <option value="mobile">Celular</option>
            <option value="landline">Fixo</option>
            <option value="none">Sem telefone</option>
          </FilterSelect>
        </FilterBar>
      </div>

      <div className="panel organizacao-bulk-bar">
        <div className="organizacao-bulk-bar-group">
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
          <button
            className="btn btn-primary organizacao-bulk-bar-btn"
            type="button"
            disabled={!toBdr || selectedCount === 0}
            onClick={() => setConfirmOpen(true)}
          >
            Transferir BDR
          </button>
        </div>
        <div className="organizacao-bulk-bar-group">
          <div className="field organizacao-bulk-bar-field">
            <label className="label" htmlFor="organizacao-new-product">
              Vincular produto (criar oportunidade)
            </label>
            <select
              id="organizacao-new-product"
              className="select"
              value={toProduct}
              onChange={(e) => setToProduct(e.target.value)}
            >
              <option value="">Selecione</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-primary organizacao-bulk-bar-btn"
            type="button"
            disabled={!toProduct || selectedCount === 0}
            onClick={() => setConfirmProductOpen(true)}
          >
            Vincular produto
          </button>
        </div>
        <div className="organizacao-bulk-bar-trailing">
          {isAdmin ? (
            <button
              className="btn btn-danger organizacao-bulk-bar-btn"
              type="button"
              disabled={selectedCount === 0}
              onClick={() => {
                setDeletePhrase("");
                setDeleteStep(1);
              }}
            >
              Apagar leads
            </button>
          ) : null}
          <label className="organizacao-bulk-select-all">
            <input
              type="checkbox"
              checked={selectAllResults}
              onChange={(e) => {
                setSelectAllResults(e.target.checked);
                if (e.target.checked) setSelected(new Set());
              }}
            />
            <span>Selecionar os {total} resultados do filtro</span>
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

      {confirmProductOpen ? (
        <div className="panel" style={{ marginTop: "1rem", borderColor: "#404040" }}>
          <p>
            Vincular <strong>{targetProductName}</strong> a <strong>{selectedCount}</strong> cliente(s) e abrir
            oportunidade? Os produtos já vinculados <strong>não serão removidos</strong>.
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn btn-primary" type="button" onClick={() => void executeProductLink()}>
              Confirmar
            </button>
            <button className="btn" type="button" onClick={() => setConfirmProductOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <CadastroModal open={deleteStep === 1} title="Apagar leads em massa" onClose={closeDeleteFlow}>
        <p className="muted" style={{ marginTop: 0 }}>
          Você está prestes a excluir <strong>{selectedCount}</strong> lead(s). Esta ação é{" "}
          <strong>permanente e irreversível</strong>.
        </p>
        <p className="muted">
          Serão removidos do sistema o cadastro do lead e, em cascata, contatos, telefones, produtos vinculados,
          oportunidades, abordagens, retornos, agendamentos, histórico de prospecção e demais registros associados a
          esses clientes.
        </p>
        <p className="muted">Use apenas para corrigir importações erradas ou dados de teste.</p>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
          <button className="btn btn-danger" type="button" onClick={() => setDeleteStep(2)}>
            Continuar para confirmação final
          </button>
          <button className="btn" type="button" onClick={closeDeleteFlow}>
            Cancelar
          </button>
        </div>
      </CadastroModal>

      <CadastroModal open={deleteStep === 2} title="Confirmação final" onClose={closeDeleteFlow}>
        <p className="muted" style={{ marginTop: 0 }}>
          Para apagar <strong>{selectedCount}</strong> lead(s), digite exatamente{" "}
          <code>{deleteConfirmExpected}</code> no campo abaixo.
        </p>
        <div className="field" style={{ marginTop: "0.75rem" }}>
          <label className="label" htmlFor="organizacao-delete-phrase">
            Texto de confirmação
          </label>
          <input
            id="organizacao-delete-phrase"
            className="input"
            value={deletePhrase}
            onChange={(e) => setDeletePhrase(e.target.value)}
            placeholder={deleteConfirmExpected}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
          <button
            className="btn btn-danger"
            type="button"
            disabled={deleteBusy || deletePhrase.trim() !== deleteConfirmExpected}
            onClick={() => void executeBulkDelete()}
          >
            {deleteBusy ? "Apagando…" : "Apagar permanentemente"}
          </button>
          <button className="btn" type="button" disabled={deleteBusy} onClick={() => setDeleteStep(1)}>
            Voltar
          </button>
          <button className="btn" type="button" disabled={deleteBusy} onClick={closeDeleteFlow}>
            Cancelar
          </button>
        </div>
      </CadastroModal>
    </div>
  );
}
