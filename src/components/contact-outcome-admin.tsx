"use client";

import { useCallback, useEffect, useState } from "react";
import { CadastroModal, CadastroPageHeader } from "@/components/cadastro-ui";

type ContactRow = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  status: string;
  requires_conversation: boolean;
};

type CommercialRow = { id: number; name: string; slug: string };

export function ContactOutcomeAdmin() {
  const [items, setItems] = useState<ContactRow[]>([]);
  const [commercial, setCommercial] = useState<CommercialRow[]>([]);
  const [compat, setCompat] = useState<Record<string, number[]>>({});
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    sort_order: "0",
    status: "active",
    requires_conversation: false,
    commercial_ids: [] as number[]
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [co, cl] = await Promise.all([
      fetch("/api/contact-outcome-types").then((r) => r.json()),
      fetch("/api/approach-classifications").then((r) => r.json())
    ]);
    setItems((co as { items?: ContactRow[] }).items ?? []);
    setCommercial((cl as { commercial?: CommercialRow[] }).commercial ?? []);
    setCompat((cl as { contact_commercial_compat?: Record<string, number[]> }).contact_commercial_compat ?? {});
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openEdit(row: ContactRow) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      description: row.description ?? "",
      sort_order: String(row.sort_order),
      status: row.status,
      requires_conversation: row.requires_conversation,
      commercial_ids: compat[String(row.id)] ?? []
    });
    setOpen(true);
  }

  async function save() {
    if (!editingId) return;
    setError(null);
    const res = await fetch(`/api/contact-outcome-types/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description || null,
        sort_order: Number(form.sort_order),
        status: form.status,
        requires_conversation: form.requires_conversation
      })
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Erro ao salvar contato");
      return;
    }
    const compatRes = await fetch("/api/approach-classifications/compat", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_outcome_type_id: editingId,
        commercial_result_type_ids: form.commercial_ids
      })
    });
    if (!compatRes.ok) {
      setError("Contato salvo, mas falha ao atualizar compatibilidade comercial.");
      return;
    }
    setOpen(false);
    void load();
  }

  return (
    <>
      <CadastroPageHeader title="Contato realizado (BDR)" onNew={() => {}} newLabel="" />
      <table className="table">
        <thead>
          <tr>
            <th>Slug</th>
            <th>Nome</th>
            <th>Exige conversa</th>
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
              <td>{row.name}</td>
              <td>{row.requires_conversation ? "Sim" : "—"}</td>
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
      <CadastroModal open={open} title="Editar contato realizado" onClose={() => setOpen(false)} wide>
        {error ? <div className="alert alert-error">{error}</div> : null}
        <div className="field">
          <label className="label">Nome</label>
          <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="field">
          <label className="label">Descrição</label>
          <textarea className="textarea" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="field">
          <label className="label">Resultados comerciais compatíveis</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {commercial.map((c) => (
              <label key={c.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={form.commercial_ids.includes(c.id)}
                  onChange={(e) => {
                    setForm((f) => ({
                      ...f,
                      commercial_ids: e.target.checked
                        ? [...f.commercial_ids, c.id]
                        : f.commercial_ids.filter((id) => id !== c.id)
                    }));
                  }}
                />
                {c.name}
              </label>
            ))}
          </div>
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
