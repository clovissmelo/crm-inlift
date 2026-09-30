"use client";

import { useEffect, useMemo, useState } from "react";
import { CadastroModal, CadastroPageHeader, CadastroRowActions, requestCadastroDelete } from "@/components/cadastro-ui";
import { ProductOwnerPicker } from "@/components/product-owner-picker";
import type { Company, Product, User } from "@/lib/types";

type ProductForm = {
  name: string;
  description: string;
  status: "active" | "inactive";
  uses_proposal: boolean;
  company_id: string;
  responsible_user_ids: number[];
  lead_gen_segment_slug: string;
  lead_gen_flow_id: string;
};

type SegmentOpt = { slug: string; label: string };
type FlowOpt = { id: number; name: string };

const emptyForm = (defaultCompanyId = ""): ProductForm => ({
  name: "",
  description: "",
  status: "active",
  uses_proposal: false,
  company_id: defaultCompanyId,
  responsible_user_ids: [],
  lead_gen_segment_slug: "",
  lead_gen_flow_id: ""
});

export function ProductsAdmin({
  users,
  companies,
  canDelete = false,
  leadGenSegments = [],
  leadGenFlows = []
}: {
  users: User[];
  companies: Company[];
  canDelete?: boolean;
  leadGenSegments?: SegmentOpt[];
  leadGenFlows?: FlowOpt[];
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const defaultCompanyId = companies.find((c) => c.status === "active")?.id ?? companies[0]?.id;
  const [form, setForm] = useState<ProductForm>(() => emptyForm(defaultCompanyId ? String(defaultCompanyId) : ""));
  const [saving, setSaving] = useState(false);
  const ownerUsers = useMemo(
    () => users.filter((u) => u.status === "active" && u.roles.includes("product_owner")),
    [users]
  );

  async function load() {
    setLoading(true);
    const res = await fetch("/api/products");
    const data = (await res.json()) as { products: Product[] };
    setProducts(data.products ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm(defaultCompanyId ? String(defaultCompanyId) : ""));
    setError(null);
    setModalOpen(true);
  }

  function openEdit(product: Product) {
    setEditingId(product.id);
    const allowedOwnerIds = new Set(ownerUsers.map((u) => u.id));
    setForm({
      name: product.name,
      description: product.description ?? "",
      status: product.status,
      uses_proposal: product.uses_proposal,
      company_id: String(product.company_id),
      responsible_user_ids: product.responsible_user_ids.filter((id) => allowedOwnerIds.has(id)),
      lead_gen_segment_slug: product.lead_gen_segment_slug ?? "",
      lead_gen_flow_id: product.lead_gen_flow_id != null ? String(product.lead_gen_flow_id) : ""
    });
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm(defaultCompanyId ? String(defaultCompanyId) : ""));
  }

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const url = editingId ? `/api/products/${editingId}` : "/api/products";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        company_id: Number(form.company_id),
        lead_gen_segment_slug: form.lead_gen_segment_slug.trim() || null,
        lead_gen_flow_id: form.lead_gen_flow_id ? Number(form.lead_gen_flow_id) : null
      })
    });
    const data = (await res.json()) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Erro ao salvar");
      return;
    }
    closeModal();
    void load();
  }

  async function removeProduct(product: Product) {
    if (!(await requestCadastroDelete(product.name))) return;
    setError(null);
    const res = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Erro ao excluir");
      return;
    }
    if (editingId === product.id) closeModal();
    void load();
  }

  return (
    <div>
      <CadastroPageHeader title="Produtos" onNew={openCreate} newLabel="Novo produto" />

      {error && !modalOpen ? <div className="alert alert-error">{error}</div> : null}

      <div className="panel table-wrap">
        {loading ? <p className="muted">Carregando…</p> : null}
        {!loading && products.length === 0 ? <p className="muted">Nenhum produto cadastrado.</p> : null}
        {products.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Empresa</th>
                <th>Situação</th>
                <th>Proposta</th>
                <th>Motor de leads</th>
                <th style={{ width: canDelete ? 180 : 100 }} />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.company_name ?? "—"}</td>
                  <td>{p.status === "active" ? "Ativo" : "Inativo"}</td>
                  <td>{p.uses_proposal ? "Sim" : "Não"}</td>
                  <td className="muted" style={{ fontSize: "0.85rem" }}>
                    {p.lead_gen_segment_label || p.lead_gen_flow_name
                      ? [p.lead_gen_segment_label, p.lead_gen_flow_name].filter(Boolean).join(" · ")
                      : "—"}
                  </td>
                  <td>
                    <CadastroRowActions
                      canDelete={canDelete}
                      onEdit={() => openEdit(p)}
                      onDelete={() => removeProduct(p)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <CadastroModal open={modalOpen} title={editingId ? "Editar produto" : "Novo produto"} onClose={closeModal} wide>
        <form className="product-form" onSubmit={saveProduct}>
          {error ? <div className="alert alert-error">{error}</div> : null}

          <div className="product-form-grid">
            <div className="field">
              <label className="label" htmlFor="product-name">
                Nome
              </label>
              <input
                id="product-name"
                className="input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="product-company">
                Empresa
              </label>
              <select
                id="product-company"
                className="select"
                value={form.company_id}
                onChange={(e) => setForm((f) => ({ ...f, company_id: e.target.value }))}
                required
              >
                <option value="">Selecione…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="product-desc">
              Descrição
            </label>
            <input
              id="product-desc"
              className="input"
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Opcional"
            />
          </div>

          <div className="product-form-grid product-form-grid--lead-gen">
            <div className="field">
              <label className="label" htmlFor="product-lead-segment">
                Público
              </label>
              <select
                id="product-lead-segment"
                className="select"
                value={form.lead_gen_segment_slug}
                onChange={(e) => setForm((f) => ({ ...f, lead_gen_segment_slug: e.target.value }))}
              >
                <option value="">— Não definido —</option>
                {leadGenSegments.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="product-lead-flow">
                Fluxo de geração
              </label>
              <select
                id="product-lead-flow"
                className="select"
                value={form.lead_gen_flow_id}
                onChange={(e) => setForm((f) => ({ ...f, lead_gen_flow_id: e.target.value }))}
              >
                <option value="">— Padrão do segmento —</option>
                {leadGenFlows.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="product-form-grid">
            <div className="field">
              <label className="label" htmlFor="product-status">
                Situação
              </label>
              <select
                id="product-status"
                className="select"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))}
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </div>
            <div className="field">
              <span className="label">Utiliza proposta?</span>
              <label className="product-form-check">
                <input
                  type="checkbox"
                  checked={form.uses_proposal}
                  onChange={(e) => setForm((f) => ({ ...f, uses_proposal: e.target.checked }))}
                />
                <span>Sim</span>
              </label>
            </div>
          </div>

          <ProductOwnerPicker
            users={users}
            selectedIds={form.responsible_user_ids}
            onChange={(responsible_user_ids) => setForm((f) => ({ ...f, responsible_user_ids }))}
            disabled={saving}
          />

          <div className="product-form-actions">
            <button type="button" className="btn" onClick={closeModal}>
              Cancelar
            </button>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </CadastroModal>
    </div>
  );
}
