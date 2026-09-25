"use client";

import { useEffect, useState } from "react";
import type { Product } from "@/lib/types";
import { PLACEHOLDER_HELP } from "@/lib/message-templates";

export function AbordagensAdmin({ products }: { products: Product[] }) {
  const [results, setResults] = useState<Array<{ id: number; name: string; status: string; suggest_follow_up: boolean }>>([]);
  const [scripts, setScripts] = useState<Array<{ id: number; title: string; script_type: string; status: string }>>([]);
  const [scriptForm, setScriptForm] = useState({
    title: "",
    product_id: "",
    script_type: "whatsapp" as "call" | "whatsapp",
    body: "",
    status: "active" as "active" | "inactive"
  });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [r, s] = await Promise.all([
      fetch("/api/approach-result-types").then((res) => res.json()),
      fetch("/api/message-scripts?all=1").then((res) => res.json())
    ]);
    setResults((r as { items: typeof results }).items);
    setScripts((s as { items: typeof scripts }).items);
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveScript(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/message-scripts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...scriptForm,
        product_id: scriptForm.product_id ? Number(scriptForm.product_id) : null
      })
    });
    if (!res.ok) {
      setError("Erro ao salvar script");
      return;
    }
    setScriptForm({ title: "", product_id: "", script_type: "whatsapp", body: "", status: "active" });
    void load();
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Abordagens</h1>
      <p className="muted">Scripts de ligação e modelos de WhatsApp. Resultados de abordagem editáveis.</p>
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Resultados cadastrados</h3>
        <ul>
          {results.map((r) => (
            <li key={r.id}>
              {r.name} — {r.status === "active" ? "Ativo" : "Inativo"}
              {r.suggest_follow_up ? " · sugere próxima ação" : ""}
            </li>
          ))}
        </ul>
      </div>

      <form className="panel" onSubmit={saveScript}>
        <h3 style={{ marginTop: 0 }}>Novo script / modelo</h3>
        <div className="field">
          <label className="label">Título</label>
          <input className="input" value={scriptForm.title} onChange={(e) => setScriptForm((f) => ({ ...f, title: e.target.value }))} required />
        </div>
        <div className="filters-row">
          <div className="field">
            <label className="label">Tipo</label>
            <select className="select" value={scriptForm.script_type} onChange={(e) => setScriptForm((f) => ({ ...f, script_type: e.target.value as "call" | "whatsapp" }))}>
              <option value="call">Script de ligação</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Produto (opcional)</label>
            <select className="select" value={scriptForm.product_id} onChange={(e) => setScriptForm((f) => ({ ...f, product_id: e.target.value }))}>
              <option value="">Geral</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label className="label">Texto</label>
          <textarea className="textarea" value={scriptForm.body} onChange={(e) => setScriptForm((f) => ({ ...f, body: e.target.value }))} required />
        </div>
        <p className="muted" style={{ fontSize: "0.75rem" }}>
          Placeholders: {PLACEHOLDER_HELP.map((p) => p.key).join(", ")}
        </p>
        <button className="btn btn-primary" type="submit">
          Salvar
        </button>
      </form>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Scripts cadastrados</h3>
        {scripts.length === 0 ? <p className="muted">Nenhum script ainda.</p> : null}
        <ul>
          {scripts.map((s) => (
            <li key={s.id}>
              {s.title} — {s.script_type === "call" ? "Ligação" : "WhatsApp"} ({s.status})
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
