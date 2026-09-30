"use client";

import { useCallback, useEffect, useState } from "react";
import { CadastroModal, CadastroPageHeader } from "@/components/cadastro-ui";

type Row = {
  id: number;
  slug: string;
  display_name: string;
  provider_rules: unknown;
  sort_order: number;
  status: string;
};

export function TechnicalResultAdmin() {
  const [items, setItems] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ display_name: "", provider_rules: "[]", sort_order: "0", status: "active" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/call-technical-result-types");
    const data = (await res.json()) as { items?: Row[] };
    setItems(data.items ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openEdit(row: Row) {
    setEditingId(row.id);
    setForm({
      display_name: row.display_name,
      provider_rules: JSON.stringify(row.provider_rules ?? [], null, 2),
      sort_order: String(row.sort_order),
      status: row.status
    });
    setOpen(true);
  }

  async function save() {
    setError(null);
    let rules: unknown;
    try {
      rules = JSON.parse(form.provider_rules);
    } catch {
      setError("JSON de mapeamento inválido.");
      return;
    }
    const res = await fetch(
      editingId ? `/api/call-technical-result-types/${editingId}` : "/api/call-technical-result-types",
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: editingId ? undefined : `custom_${Date.now()}`,
          display_name: form.display_name,
          provider_rules: rules,
          sort_order: Number(form.sort_order),
          status: form.status
        })
      }
    );
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Erro ao salvar");
      return;
    }
    setOpen(false);
    void load();
  }

  return (
    <>
      <CadastroPageHeader title="Resultado da ligação (telefonia)" onNew={() => {}} newLabel="" />
      <p className="muted" style={{ marginTop: 0 }}>
        Nomes exibidos e mapeamento dos códigos do provedor. A integração usa o <strong>slug</strong>, não o texto.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Slug</th>
            <th>Nome</th>
            <th>Ordem</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>
                <code>{row.slug}</code>
              </td>
              <td>{row.display_name}</td>
              <td>{row.sort_order}</td>
              <td>{row.status}</td>
              <td>
                <button type="button" className="btn" onClick={() => openEdit(row)}>
                  Editar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <CadastroModal open={open} title="Editar resultado técnico" onClose={() => setOpen(false)}>
        {error ? <div className="alert alert-error">{error}</div> : null}
        <div className="field">
          <label className="label">Nome exibido</label>
          <input className="input" value={form.display_name} onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))} />
        </div>
        <div className="field">
          <label className="label">Ordem</label>
          <input className="input" type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} />
        </div>
        <div className="field">
          <label className="label">Mapeamento (JSON)</label>
          <textarea className="textarea" rows={8} value={form.provider_rules} onChange={(e) => setForm((f) => ({ ...f, provider_rules: e.target.value }))} />
        </div>
        <div className="field">
          <label className="label">Status</label>
          <select className="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
          </select>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn btn-primary" onClick={() => void save()}>
            Salvar
          </button>
        </div>
      </CadastroModal>
    </>
  );
}
