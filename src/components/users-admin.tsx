"use client";

import { useEffect, useState } from "react";
import { ROLE_LABELS, type User, type UserRole } from "@/lib/types";

const ALL_ROLES: UserRole[] = ["bdr", "product_owner", "manager"];

export function UsersAdmin() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    status: "active" as "active" | "inactive",
    roles: ["bdr"] as UserRole[]
  });

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

  function toggleRole(role: UserRole) {
    setForm((f) => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role]
    }));
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Erro ao criar");
      return;
    }
    setForm({ name: "", email: "", phone: "", password: "", status: "active", roles: ["bdr"] });
    void load();
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Usuários</h1>
      {error ? <div className="alert alert-error">{error}</div> : null}

      <form className="panel" onSubmit={createUser}>
        <h3 style={{ marginTop: 0 }}>Novo usuário</h3>
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
          <label className="label">Senha inicial</label>
          <input className="input" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required />
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
        <button className="btn btn-primary" type="submit">
          Cadastrar
        </button>
      </form>

      <div className="panel table-wrap">
        <h3 style={{ marginTop: 0 }}>Lista</h3>
        {loading ? <p className="muted">Carregando…</p> : null}
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Perfis</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.roles.map((r) => ROLE_LABELS[r]).join(", ") || "—"}</td>
                <td>{u.status === "active" ? "Ativo" : "Inativo"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
