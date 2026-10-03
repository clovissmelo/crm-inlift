"use client";

import { Mail, MessageCircle, Phone } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CadastroModal, CadastroPageHeader, CadastroRowActions, requestCadastroDelete } from "@/components/cadastro-ui";
import { FilterBar, FilterSelect } from "@/components/filter-bar";
import { ScriptFlowEditor } from "@/components/script-flow-editor";
import { PLACEHOLDER_HELP } from "@/lib/message-templates";
import { defaultEmptyCallFlow, parseCallScriptBody, serializeCallScriptFlow } from "@/lib/script-flow";
import type { Product } from "@/lib/types";

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
  script_type: "call" | "whatsapp" | "email";
  body: string;
  status: "active" | "inactive";
};

const emptyScriptForm = (): ScriptForm => ({
  title: "",
  product_id: "",
  script_type: "call",
  body: serializeCallScriptFlow(defaultEmptyCallFlow()),
  status: "active"
});

function scriptTypeLabel(type: string) {
  if (type === "call") return "Ligação";
  if (type === "email") return "E-mail";
  return "WhatsApp";
}

function ScriptTypeWithIcon({ type }: { type: string }) {
  const label = scriptTypeLabel(type);
  const Icon = type === "call" ? Phone : type === "email" ? Mail : MessageCircle;
  return (
    <span className="script-type-with-icon">
      <Icon size={16} aria-hidden className="script-type-with-icon__glyph" />
      <span>{label}</span>
    </span>
  );
}

export function AbordagensAdmin({ products, canDelete = false }: { products: Product[]; canDelete?: boolean }) {
  const [scripts, setScripts] = useState<ScriptRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filterProductId, setFilterProductId] = useState("");
  const [filterType, setFilterType] = useState("");

  const [scriptModal, setScriptModal] = useState(false);
  const [scriptEditingId, setScriptEditingId] = useState<number | null>(null);
  const [scriptForm, setScriptForm] = useState<ScriptForm>(emptyScriptForm());
  const [scriptSaving, setScriptSaving] = useState(false);

  const load = useCallback(async () => {
    const s = await fetch("/api/message-scripts?all=1").then((res) => res.json());
    setScripts((s as { items: ScriptRow[] }).items ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const productNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of products) map.set(p.id, p.name);
    return map;
  }, [products]);

  const filteredScripts = useMemo(() => {
    return scripts.filter((s) => {
      if (filterType && s.script_type !== filterType) return false;
      if (!filterProductId) return true;
      if (filterProductId === "geral") return s.product_id == null;
      return s.product_id === Number(filterProductId);
    });
  }, [scripts, filterProductId, filterType]);

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
      script_type: row.script_type as "call" | "whatsapp" | "email",
      body: row.body,
      status: row.status as "active" | "inactive"
    });
    setError(null);
    setScriptModal(true);
  }

  async function saveScript(e: React.FormEvent) {
    e.preventDefault();
    setScriptSaving(true);
    setError(null);
    if (scriptForm.script_type === "call" && !parseCallScriptBody(scriptForm.body)) {
      setScriptSaving(false);
      setError("Configure ao menos uma etapa no fluxo de ligação.");
      return;
    }
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
      {error && !scriptModal ? <div className="alert alert-error">{error}</div> : null}

      <CadastroPageHeader title="Scripts e modelos" onNew={openScriptCreate} newLabel="Novo script" />

      <FilterBar>
        <FilterSelect label="Produto" value={filterProductId} onChange={(e) => setFilterProductId(e.target.value)}>
          <option value="">Todos</option>
          <option value="geral">Geral (sem produto)</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Tipo" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">Todos</option>
          <option value="call">Ligação</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">E-mail</option>
        </FilterSelect>
      </FilterBar>

      <div className="panel table-wrap">
        {filteredScripts.length === 0 ? <p className="muted">Nenhum script encontrado.</p> : null}
        {filteredScripts.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Título</th>
                <th>Produto</th>
                <th>Tipo</th>
                <th>Situação</th>
                <th style={{ width: canDelete ? 180 : 100 }} />
              </tr>
            </thead>
            <tbody>
              {filteredScripts.map((s) => (
                <tr key={s.id}>
                  <td>{s.title}</td>
                  <td>{s.product_id != null ? productNameById.get(s.product_id) ?? "—" : "Geral"}</td>
                  <td>
                    <ScriptTypeWithIcon type={s.script_type} />
                  </td>
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
        extraWide
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
              <select
                className="select"
                value={scriptForm.script_type}
                onChange={(e) => setScriptForm((f) => ({ ...f, script_type: e.target.value as "call" | "whatsapp" | "email" }))}
              >
                <option value="call">Script de ligação</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">E-mail</option>
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
            <div className="field">
              <label className="label">Situação</label>
              <select className="select" value={scriptForm.status} onChange={(e) => setScriptForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))}>
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </div>
          </div>
          {scriptForm.script_type === "call" ? (
            <div className="field script-flow-modal-field">
              <ScriptFlowEditor
                key={`flow-${scriptEditingId ?? "new"}-${scriptModal}`}
                body={scriptForm.body}
                onBodyChange={(body) => setScriptForm((f) => ({ ...f, body }))}
              />
            </div>
          ) : (
            <>
              <div className="field">
                <label className="label">Texto</label>
                <textarea
                  className="textarea"
                  value={scriptForm.body}
                  onChange={(e) => setScriptForm((f) => ({ ...f, body: e.target.value }))}
                  required
                />
              </div>
              <p className="muted" style={{ fontSize: "0.75rem" }}>
                Placeholders: {PLACEHOLDER_HELP.map((p) => p.key).join(", ")}
              </p>
            </>
          )}
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
    </div>
  );
}
