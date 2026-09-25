"use client";

import { useCallback, useEffect, useState } from "react";
import { CadastroModal, CadastroPageHeader, CadastroRowActions, requestCadastroDelete } from "@/components/cadastro-ui";
import { PLACEHOLDER_HELP } from "@/lib/message-templates";
import type { Product } from "@/lib/types";

type ResultRow = { id: number; name: string; status: string; suggest_follow_up: boolean };
type ScriptRow = {
  id: number;
  title: string;
  script_type: string;
  status: string;
  body: string;
  product_id: number | null;
};

type ScriptForm = {
  title: string;
  product_id: string;
  script_type: "call" | "whatsapp";
  body: string;
  status: "active" | "inactive";
};

type ResultForm = {
  name: string;
  slug: string;
  status: "active" | "inactive";
  suggest_follow_up: boolean;
};

const emptyScriptForm = (): ScriptForm => ({
  title: "",
  product_id: "",
  script_type: "whatsapp",
  body: "",
  status: "active"
});

export function AbordagensAdmin({ products, canDelete = false }: { products: Product[]; canDelete?: boolean }) {
  const [results, setResults] = useState<ResultRow[]>([]);
  const [scripts, setScripts] = useState<ScriptRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [scriptModal, setScriptModal] = useState(false);
  const [scriptEditingId, setScriptEditingId] = useState<number | null>(null);
  const [scriptForm, setScriptForm] = useState<ScriptForm>(emptyScriptForm());
  const [scriptSaving, setScriptSaving] = useState(false);

  const [resultModal, setResultModal] = useState(false);
  const [resultEditingId, setResultEditingId] = useState<number | null>(null);
  const [resultForm, setResultForm] = useState<ResultForm>({ name: "", slug: "", status: "active", suggest_follow_up: false });
  const [resultSaving, setResultSaving] = useState(false);

  const load = useCallback(async () => {
    const [r, s] = await Promise.all([
      fetch("/api/approach-result-types").then((res) => res.json()),
      fetch("/api/message-scripts?all=1").then((res) => res.json())
    ]);
    setResults((r as { items: ResultRow[] }).items ?? []);
    setScripts((s as { items: ScriptRow[] }).items ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openScriptCreate() {
    setScriptEditingId(null);
    setScriptForm(emptyScriptForm());
    setError(null);
    setScriptModal(true);
  }

  function openScriptEdit(row: ScriptRow) {
    setScriptEditingId(row.id);
    setScriptForm({
      title: row.title,
      product_id: row.product_id ? String(row.product_id) : "",
      script_type: row.script_type as "call" | "whatsapp",
      body: row.body,
      status: row.status as "active" | "inactive"
    });
    setError(null);
    setScriptModal(true);
  }

  function openResultCreate() {
    setResultEditingId(null);
    setResultForm({ name: "", slug: "", status: "active", suggest_follow_up: false });
    setError(null);
    setResultModal(true);
  }

  function openResultEdit(row: ResultRow) {
    setResultEditingId(row.id);
    setResultForm({
      name: row.name,
      slug: "",
      status: row.status as "active" | "inactive",
      suggest_follow_up: row.suggest_follow_up
    });
    setError(null);
    setResultModal(true);
  }

  async function saveScript(e: React.FormEvent) {
    e.preventDefault();
    setScriptSaving(true);
    setError(null);
    const payload = {
      ...scriptForm,
      product_id: scriptForm.product_id ? Number(scriptForm.product_id) : null
    };
    const url = scriptEditingId ? `/api/message-scripts/${scriptEditingId}` : "/api/message-scripts";
    const method = scriptEditingId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    setScriptSaving(false);
    if (!res.ok) {
      setError("Erro ao salvar script");
      return;
    }
    setScriptModal(false);
    void load();
  }

  async function saveResult(e: React.FormEvent) {
    e.preventDefault();
    setResultSaving(true);
    setError(null);
    const url = resultEditingId ? `/api/approach-result-types/${resultEditingId}` : "/api/approach-result-types";
    const method = resultEditingId ? "PATCH" : "POST";
    const body = resultEditingId
      ? { name: resultForm.name, status: resultForm.status, suggest_follow_up: resultForm.suggest_follow_up }
      : resultForm;
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    setResultSaving(false);
    if (!res.ok) {
      setError("Erro ao salvar resultado");
      return;
    }
    setResultModal(false);
    void load();
  }

  async function removeResult(row: ResultRow) {
    if (!(await requestCadastroDelete(row.name))) return;
    setError(null);
    const res = await fetch(`/api/approach-result-types/${row.id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Erro ao excluir");
      return;
    }
    if (resultEditingId === row.id) setResultModal(false);
    void load();
  }

  async function removeScript(row: ScriptRow) {
    if (!(await requestCadastroDelete(row.title))) return;
    setError(null);
    const res = await fetch(`/api/message-scripts/${row.id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Erro ao excluir");
      return;
    }
    if (scriptEditingId === row.id) setScriptModal(false);
    void load();
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Abordagens</h1>
      <p className="muted">Scripts de ligação, modelos de WhatsApp e resultados de abordagem.</p>
      {error && !scriptModal && !resultModal ? <div className="alert alert-error">{error}</div> : null}

      <CadastroPageHeader
        title="Resultados de abordagem"
        description="Tipos de resultado ao registrar uma abordagem."
        onNew={openResultCreate}
        newLabel="Novo resultado"
      />
      <div className="panel table-wrap" style={{ marginBottom: "2rem" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Situação</th>
              <th>Próxima ação</th>
              <th style={{ width: canDelete ? 180 : 100 }} />
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.status === "active" ? "Ativo" : "Inativo"}</td>
                <td>{r.suggest_follow_up ? "Sugere follow-up" : "—"}</td>
                <td>
                  <CadastroRowActions
                    canDelete={canDelete}
                    onEdit={() => openResultEdit(r)}
                    onDelete={() => removeResult(r)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CadastroPageHeader title="Scripts e modelos" onNew={openScriptCreate} newLabel="Novo script" />

      <div className="panel table-wrap">
        {scripts.length === 0 ? <p className="muted">Nenhum script cadastrado.</p> : null}
        {scripts.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Título</th>
                <th>Tipo</th>
                <th>Situação</th>
                <th style={{ width: canDelete ? 180 : 100 }} />
              </tr>
            </thead>
            <tbody>
              {scripts.map((s) => (
                <tr key={s.id}>
                  <td>{s.title}</td>
                  <td>{s.script_type === "call" ? "Ligação" : "WhatsApp"}</td>
                  <td>{s.status === "active" ? "Ativo" : "Inativo"}</td>
                  <td>
                    <CadastroRowActions
                      canDelete={canDelete}
                      onEdit={() => openScriptEdit(s)}
                      onDelete={() => removeScript(s)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <CadastroModal
        open={scriptModal}
        title={scriptEditingId ? "Editar script" : "Novo script / modelo"}
        onClose={() => setScriptModal(false)}
        wide
      >
        <form onSubmit={saveScript}>
          {error ? <div className="alert alert-error">{error}</div> : null}
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
            <label className="label">Situação</label>
            <select className="select" value={scriptForm.status} onChange={(e) => setScriptForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Texto</label>
            <textarea className="textarea" value={scriptForm.body} onChange={(e) => setScriptForm((f) => ({ ...f, body: e.target.value }))} required />
          </div>
          <p className="muted" style={{ fontSize: "0.75rem" }}>
            Placeholders: {PLACEHOLDER_HELP.map((p) => p.key).join(", ")}
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => setScriptModal(false)}>
              Cancelar
            </button>
            <button className="btn btn-primary" type="submit" disabled={scriptSaving}>
              {scriptSaving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </CadastroModal>

      <CadastroModal
        open={resultModal}
        title={resultEditingId ? "Editar resultado" : "Novo resultado"}
        onClose={() => setResultModal(false)}
      >
        <form onSubmit={saveResult}>
          {error ? <div className="alert alert-error">{error}</div> : null}
          {!resultEditingId ? (
            <div className="field">
              <label className="label">Identificador (slug)</label>
              <input
                className="input"
                value={resultForm.slug}
                onChange={(e) => setResultForm((f) => ({ ...f, slug: e.target.value }))}
                required
                placeholder="ex.: retorno_agendado"
              />
            </div>
          ) : null}
          <div className="field">
            <label className="label">Nome</label>
            <input className="input" value={resultForm.name} onChange={(e) => setResultForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="field">
            <label className="label">Situação</label>
            <select className="select" value={resultForm.status} onChange={(e) => setResultForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>
          <label style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input type="checkbox" checked={resultForm.suggest_follow_up} onChange={(e) => setResultForm((f) => ({ ...f, suggest_follow_up: e.target.checked }))} />
            Sugere próxima ação / follow-up
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => setResultModal(false)}>
              Cancelar
            </button>
            <button className="btn btn-primary" type="submit" disabled={resultSaving}>
              {resultSaving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </CadastroModal>
    </div>
  );
}
