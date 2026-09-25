"use client";

import { useEffect, useState } from "react";
import type { Product, User } from "@/lib/types";

export function ProductsAdmin({ users }: { users: User[] }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    status: "active" as "active" | "inactive",
    uses_proposal: false,
    responsible_user_ids: [] as number[]
  });

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

  function toggleResponsible(userId: number) {
    setForm((f) => ({
      ...f,
      responsible_user_ids: f.responsible_user_ids.includes(userId)
        ? f.responsible_user_ids.filter((id) => id !== userId)
        : [...f.responsible_user_ids, userId]
    }));
  }

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Erro ao salvar");
      return;
    }
    setForm({ name: "", description: "", status: "active", uses_proposal: false, responsible_user_ids: [] });
    void load();
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Produtos</h1>
      {error ? <div className="alert alert-error">{error}</div> : null}

      <form className="panel" onSubmit={createProduct}>
        <h3 style={{ marginTop: 0 }}>Novo produto</h3>
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
              <input type="checkbox" checked={form.responsible_user_ids.includes(u.id)} onChange={() => toggleResponsible(u.id)} />{" "}
              {u.name} — {u.email}
            </label>
          ))}
        </div>
        <button className="btn btn-primary" type="submit">
          Cadastrar
        </button>
      </form>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Lista</h3>
        {loading ? <p className="muted">Carregando…</p> : null}
        {products.length === 0 && !loading ? <p className="muted">Nenhum produto.</p> : null}
        <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
          {products.map((p) => (
            <li key={p.id} style={{ marginBottom: 8 }}>
              <strong>{p.name}</strong> — {p.status === "active" ? "Ativo" : "Inativo"}
              {p.uses_proposal ? " · Com proposta" : ""}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
