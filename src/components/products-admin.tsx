"use client";

import { useEffect, useState } from "react";
import { CadastroModal, CadastroPageHeader, CadastroRowActions, requestCadastroDelete } from "@/components/cadastro-ui";
import type { Product, User } from "@/lib/types";

type ProductForm = {
  name: string;
  description: string;
  status: "active" | "inactive";
  uses_proposal: boolean;
  responsible_user_ids: number[];
};

const emptyForm = (): ProductForm => ({
  name: "",
  description: "",
  status: "active",
  uses_proposal: false,
  responsible_user_ids: []
});

export function ProductsAdmin({ users, canDelete = false }: { users: User[]; canDelete?: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm());
  const [saving, setSaving] = useState(false);

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
    setForm(emptyForm());
    setError(null);
    setModalOpen(true);
  }

  function openEdit(product: Product) {
    setEditingId(product.id);
    setForm({
      name: product.name,
      description: product.description ?? "",
      status: product.status,
      uses_proposal: product.uses_proposal,
      responsible_user_ids: [...product.responsible_user_ids]
    });
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  function toggleResponsible(userId: number) {
    setForm((f) => ({
      ...f,
      responsible_user_ids: f.responsible_user_ids.includes(userId)
        ? f.responsible_user_ids.filter((id) => id !== userId)
        : [...f.responsible_user_ids, userId]
    }));
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
      body: JSON.stringify(form)
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
                <th>Situação</th>
                <th>Proposta</th>
                <th style={{ width: canDelete ? 180 : 100 }} />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.status === "active" ? "Ativo" : "Inativo"}</td>
                  <td>{p.uses_proposal ? "Sim" : "Não"}</td>
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

      <CadastroModal open={modalOpen} title={editingId ? "Editar produto" : "Novo produto"} onClose={closeModal}>
        <form onSubmit={saveProduct}>
          {error ? <div className="alert alert-error">{error}</div> : null}
          <div className="field">
            <label className="label">Nome</label>
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="field">
            <label className="label">Descrição</label>
            <textarea className="textarea" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="field">
            <label className="label">Situação</label>
            <select className="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>
          <label style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input type="checkbox" checked={form.uses_proposal} onChange={(e) => setForm((f) => ({ ...f, uses_proposal: e.target.checked }))} />
            Utiliza proposta?
          </label>
          <div className="field">
            <span className="label">Responsáveis</span>
            {users.map((u) => (
              <label key={u.id} style={{ display: "block" }}>
                <input type="checkbox" checked={form.responsible_user_ids.includes(u.id)} onChange={() => toggleResponsible(u.id)} /> {u.name} — {u.email}
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
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
