"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LeadQualificationPicker } from "@/components/lead-qualification-picker";
import type { LeadQualification } from "@/lib/lead-qualification";
import type { Product, User } from "@/lib/types";

export function ClientForm({ products, bdrs, clientId }: { products: Product[]; bdrs: User[]; clientId?: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    cnpj: "",
    legal_name: "",
    trade_name: "",
    segment: "",
    city: "",
    uf: "",
    address: "",
    website: "",
    instagram: "",
    notes: "",
    bdr_user_id: "",
    product_ids: [] as number[],
    lead_qualification: "cold" as LeadQualification
  });

  function toggleProduct(id: number) {
    setForm((f) => ({
      ...f,
      product_ids: f.product_ids.includes(id) ? f.product_ids.filter((x) => x !== id) : [...f.product_ids, id]
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const payload = {
      ...form,
      bdr_user_id: form.bdr_user_id ? Number(form.bdr_user_id) : null,
      product_ids: form.product_ids
    };
    const url = clientId ? `/api/clients/${clientId}` : "/api/clients";
    const method = clientId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = (await res.json()) as { error?: string; id?: number };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Erro ao salvar");
      return;
    }
    router.push(`/clientes/${clientId ?? data.id}`);
    router.refresh();
  }

  return (
    <form className="panel" onSubmit={onSubmit} style={{ maxWidth: 640 }}>
      <h1 style={{ marginTop: 0 }}>{clientId ? "Editar cliente" : "Novo cliente"}</h1>
      {error ? <div className="alert alert-error">{error}</div> : null}
      <div className="field">
        <label className="label">CNPJ</label>
        <input className="input" value={form.cnpj} onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))} />
      </div>
      <div className="field">
        <label className="label">Razão social</label>
        <input className="input" value={form.legal_name} onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))} />
      </div>
      <div className="field">
        <label className="label">Nome fantasia</label>
        <input className="input" value={form.trade_name} onChange={(e) => setForm((f) => ({ ...f, trade_name: e.target.value }))} />
      </div>
      <div className="field">
        <label className="label">Qualificação do lead</label>
        <LeadQualificationPicker
          value={form.lead_qualification}
          onChange={(lead_qualification) => setForm((f) => ({ ...f, lead_qualification }))}
        />
      </div>
      <div className="field">
        <label className="label">Segmento</label>
        <input className="input" value={form.segment} onChange={(e) => setForm((f) => ({ ...f, segment: e.target.value }))} />
      </div>
      <div className="filters-row">
        <div className="field">
          <label className="label">Cidade</label>
          <input className="input" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
        </div>
        <div className="field">
          <label className="label">UF</label>
          <input className="input" maxLength={2} value={form.uf} onChange={(e) => setForm((f) => ({ ...f, uf: e.target.value }))} />
        </div>
      </div>
      <div className="field">
        <label className="label">Endereço</label>
        <input className="input" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
      </div>
      <div className="field">
        <label className="label">Site</label>
        <input className="input" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
      </div>
      <div className="field">
        <label className="label">Instagram</label>
        <input className="input" value={form.instagram} onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))} />
      </div>
      <div className="field">
        <label className="label">BDR responsável</label>
        <select className="select" value={form.bdr_user_id} onChange={(e) => setForm((f) => ({ ...f, bdr_user_id: e.target.value }))}>
          <option value="">Nenhuma</option>
          {bdrs.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <span className="label">Produtos de interesse</span>
        {products.map((p) => (
          <label key={p.id} style={{ display: "block" }}>
            <input type="checkbox" checked={form.product_ids.includes(p.id)} onChange={() => toggleProduct(p.id)} /> {p.name}
          </label>
        ))}
      </div>
      <div className="field">
        <label className="label">Observações</label>
        <textarea className="textarea" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
      </div>
      <button className="btn btn-primary" type="submit" disabled={loading}>
        Salvar
      </button>
    </form>
  );
}
