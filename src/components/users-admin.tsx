"use client";

import { useEffect, useState } from "react";
import { CadastroModal, CadastroPageHeader } from "@/components/cadastro-ui";
import { ROLE_LABELS, type User, type UserRole } from "@/lib/types";

const ALL_ROLES: UserRole[] = ["bdr", "product_owner", "manager", "admin"];

type UserForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
  status: "active" | "inactive";
  roles: UserRole[];
};

const emptyForm = (): UserForm => ({
  name: "",
  email: "",
  phone: "",
  password: "",
  status: "active",
  roles: ["bdr"]
});

export function UsersAdmin() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/users");
    const data = (await res.json()) as { users: User[] };
    setUsers(data.users ?? []);
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

  function openEdit(user: User) {
    setEditingId(user.id);
    setForm({
      name: user.name,
      email: user.email,
      phone: user.phone ?? "",
      password: "",
      status: user.status,
      roles: [...user.roles]
    });
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  function toggleRole(role: UserRole) {
    setForm((f) => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role]
    }));
  }

  async function saveUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload: Record<string, unknown> = {
      name: form.name,
      email: form.email,
      phone: form.phone || null,
      status: form.status,
      roles: form.roles
    };
    if (form.password.trim()) payload.password = form.password;

    if (!editingId) {
      if (!form.password.trim()) {
        setError("Informe a senha inicial.");
        setSaving(false);
        return;
      }
      payload.password = form.password;
    }

    const url = editingId ? `/api/users/${editingId}` : "/api/users";
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

  return (
    <div>
      <CadastroPageHeader title="Usuários" onNew={openCreate} newLabel="Novo usuário" />

      {error && !modalOpen ? <div className="alert alert-error">{error}</div> : null}

      <div className="panel table-wrap">
        {loading ? <p className="muted">Carregando…</p> : null}
        {!loading && users.length === 0 ? <p className="muted">Nenhum usuário cadastrado.</p> : null}
        {users.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfis</th>
                <th>Situação</th>
                <th style={{ width: 100 }} />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.roles.map((r) => ROLE_LABELS[r]).join(", ") || "—"}</td>
                  <td>{u.status === "active" ? "Ativo" : "Inativo"}</td>
                  <td>
                    <div className="cadastro-list-actions">
                      <button type="button" className="btn" onClick={() => openEdit(u)}>
                        Editar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <CadastroModal open={modalOpen} title={editingId ? "Editar usuário" : "Novo usuário"} onClose={closeModal}>
        <form onSubmit={saveUser}>
          {error ? <div className="alert alert-error">{error}</div> : null}
          <div className="field">
            <label className="label">Nome</label>
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="field">
            <label className="label">E-mail</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          </div>
          <div className="field">
            <label className="label">WhatsApp</label>
            <input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="field">
            <label className="label">{editingId ? "Nova senha (opcional)" : "Senha inicial"}</label>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required={!editingId}
              placeholder={editingId ? "Deixe em branco para manter" : undefined}
            />
          </div>
          <div className="field">
            <label className="label">Situação</label>
            <select className="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>
          <div className="field">
            <span className="label">Perfis</span>
            {ALL_ROLES.map((role) => (
              <label key={role} style={{ display: "block", marginBottom: 4 }}>
                <input type="checkbox" checked={form.roles.includes(role)} onChange={() => toggleRole(role)} /> {ROLE_LABELS[role]}
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
