"use client";

import { useEffect, useState } from "react";
import { CadastroModal, CadastroPageHeader, CadastroRowActions, requestCadastroDelete } from "@/components/cadastro-ui";
import { formatCnpj } from "@/lib/format";
import type { Company, User } from "@/lib/types";

type CompanyForm = {
  name: string;
  legal_name: string;
  cnpj: string;
  responsible_user_id: string;
  status: "active" | "inactive";
};

const emptyForm = (): CompanyForm => ({
  name: "",
  legal_name: "",
  cnpj: "",
  responsible_user_id: "",
  status: "active"
});

export function CompaniesAdmin({ users, canDelete = false }: { users: User[]; canDelete?: boolean }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CompanyForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/companies");
    const data = (await res.json()) as { companies: Company[] };
    setCompanies(data.companies ?? []);
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

  function openEdit(company: Company) {
    setEditingId(company.id);
    setForm({
      name: company.name,
      legal_name: company.legal_name ?? "",
      cnpj: company.cnpj ? formatCnpj(company.cnpj) : "",
      responsible_user_id: company.responsible_user_id ? String(company.responsible_user_id) : "",
      status: company.status
    });
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  async function saveCompany(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name,
      legal_name: form.legal_name || null,
      cnpj: form.cnpj || null,
      responsible_user_id: form.responsible_user_id ? Number(form.responsible_user_id) : null,
      status: form.status
    };
    const url = editingId ? `/api/companies/${editingId}` : "/api/companies";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
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

  async function removeCompany(company: Company) {
    if (!(await requestCadastroDelete(company.name))) return;
    setError(null);
    const res = await fetch(`/api/companies/${company.id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Erro ao excluir");
      return;
    }
    if (editingId === company.id) closeModal();
    void load();
  }

  return (
    <div>
      <CadastroPageHeader title="Empresas" onNew={openCreate} newLabel="Nova empresa" />

      {error && !modalOpen ? <div className="alert alert-error">{error}</div> : null}

      <div className="panel table-wrap">
        {loading ? <p className="muted">Carregando…</p> : null}
        {!loading && companies.length === 0 ? <p className="muted">Nenhuma empresa cadastrada.</p> : null}
        {companies.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Razão social</th>
                <th>CNPJ</th>
                <th>Responsável</th>
                <th>Situação</th>
                <th style={{ width: canDelete ? 180 : 100 }} />
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.legal_name ?? "—"}</td>
                  <td>{c.cnpj ? formatCnpj(c.cnpj) : "—"}</td>
                  <td>{c.responsible_name ?? "—"}</td>
                  <td>{c.status === "active" ? "Ativo" : "Inativo"}</td>
                  <td>
                    <CadastroRowActions
                      canDelete={canDelete}
                      onEdit={() => openEdit(c)}
                      onDelete={() => removeCompany(c)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <CadastroModal open={modalOpen} title={editingId ? "Editar empresa" : "Nova empresa"} onClose={closeModal}>
        <form onSubmit={saveCompany}>
          {error ? <div className="alert alert-error">{error}</div> : null}
          <div className="field">
            <label className="label">Nome *</label>
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="field">
            <label className="label">Razão social</label>
            <input
              className="input"
              value={form.legal_name}
              onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))}
            />
          </div>
          <div className="field">
            <label className="label">CNPJ</label>
            <input className="input" value={form.cnpj} onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))} />
          </div>
          <div className="field">
            <label className="label">Responsável</label>
            <select
              className="select"
              value={form.responsible_user_id}
              onChange={(e) => setForm((f) => ({ ...f, responsible_user_id: e.target.value }))}
            >
              <option value="">Nenhum</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Situação</label>
            <select
              className="select"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))}
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
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
