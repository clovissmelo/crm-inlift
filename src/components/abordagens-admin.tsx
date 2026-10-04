"use client";

import { Mail, MessageCircle, Phone } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CadastroModal, CadastroPageHeader, CadastroRowActions, requestCadastroDelete } from "@/components/cadastro-ui";
import { FilterBar, FilterSelect } from "@/components/filter-bar";
import {
  ResultadoComercialSimulatorPanel,
  type SimulatorDraftScript
} from "@/components/resultado-comercial-simulator-panel";
import { ScriptFlowEditor } from "@/components/script-flow-editor";
import { PLACEHOLDER_HELP } from "@/lib/message-templates";
import {
  defaultEmptyCallFlow,
  normalizeCallScriptBodyForSave,
  parseCallScriptBody,
  serializeCallScriptFlow
} from "@/lib/script-flow";
import type { Product } from "@/lib/types";
import "./resultado-comercial-admin.css";

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
  const [scriptSaveNotice, setScriptSaveNotice] = useState<string | null>(null);
  const [flowEditorKey, setFlowEditorKey] = useState(0);
  const [simulatorOpen, setSimulatorOpen] = useState(false);

  const liveSimulatorDraft = useMemo((): SimulatorDraftScript | null => {
    if (scriptForm.script_type !== "call") return null;
    return {
      body: normalizeCallScriptBodyForSave(scriptForm.body),
      productId: scriptForm.product_id ? Number(scriptForm.product_id) : null
    };
  }, [scriptForm.body, scriptForm.product_id, scriptForm.script_type]);

  const splitTestMode = scriptModal && simulatorOpen && scriptForm.script_type === "call";

  function closeScriptModal() {
    setScriptModal(false);
    setSimulatorOpen(false);
  }

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
    setScriptSaveNotice(null);
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
    setScriptSaveNotice(null);
    setError(null);
    setScriptModal(true);
  }

  function testScriptFromModal() {
    if (scriptForm.script_type !== "call") return;
    if (!parseCallScriptBody(scriptForm.body)) {
      setError("Configure ao menos uma etapa no fluxo de ligação.");
      return;
    }
    setSimulatorOpen(true);
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
    const bodyForSave =
      scriptForm.script_type === "call"
        ? normalizeCallScriptBodyForSave(scriptForm.body)
        : scriptForm.body;
    const payload = {
      ...scriptForm,
      body: bodyForSave,
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
    const created = !scriptEditingId ? ((await res.json()) as { id?: number }) : null;
    if (created?.id) setScriptEditingId(created.id);
    setScriptForm((f) => ({ ...f, body: bodyForSave }));
    setFlowEditorKey((k) => k + 1);
    setScriptSaveNotice("Salvo — você pode continuar editando.");
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
    if (scriptEditingId === row.id) closeScriptModal();
    void load();
  }

  const scriptEditorForm = (
    <form onSubmit={saveScript}>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {scriptSaveNotice ? (
        <div className="alert" style={{ marginBottom: 12 }}>
          {scriptSaveNotice}
        </div>
      ) : null}
      <div className="filters-row script-modal-meta-row">
        <div className="field script-modal-meta-title">
          <label className="label">Título</label>
          <input
            className="input"
            value={scriptForm.title}
            onChange={(e) => setScriptForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
        </div>
        <div className="field">
          <label className="label">Tipo</label>
          <select
            className="select"
            value={scriptForm.script_type}
            onChange={(e) =>
              setScriptForm((f) => ({ ...f, script_type: e.target.value as "call" | "whatsapp" | "email" }))
            }
          >
            <option value="call">Script de ligação</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">E-mail</option>
          </select>
        </div>
        <div className="field">
          <label className="label">Produto (opcional)</label>
          <select
            className="select"
            value={scriptForm.product_id}
            onChange={(e) => setScriptForm((f) => ({ ...f, product_id: e.target.value }))}
          >
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
          <select
            className="select"
            value={scriptForm.status}
            onChange={(e) => setScriptForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))}
          >
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
          </select>
        </div>
      </div>
      {scriptForm.script_type === "call" ? (
        <div className="field script-flow-modal-field">
          <ScriptFlowEditor
            key={`flow-${scriptEditingId ?? "new"}-${flowEditorKey}`}
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
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button type="button" className="btn" onClick={closeScriptModal}>
          Cancelar
        </button>
        {scriptForm.script_type === "call" ? (
          <button
            type="button"
            className="btn btn-result-test"
            onClick={() => {
              if (splitTestMode) setSimulatorOpen(false);
              else testScriptFromModal();
            }}
          >
            <span className="btn-result-test-icon" aria-hidden>
              {splitTestMode ? "◀" : "▶"}
            </span>
            {splitTestMode ? "Ocultar teste" : "Testar"}
          </button>
        ) : null}
        <button className="btn btn-primary" type="submit" disabled={scriptSaving}>
          {scriptSaving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );

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

      {scriptModal ? (
        splitTestMode ? (
          <div
            className="abordagem-script-test-split"
            role="dialog"
            aria-modal="true"
            aria-labelledby="abordagem-script-test-title"
          >
            <div className="abordagem-script-test-split-editor">
              <header className="abordagem-script-test-split-editor-head">
                <div>
                  <h2 id="abordagem-script-test-title">
                    {scriptEditingId ? "Editar script" : "Novo script / modelo"}
                  </h2>
                  <p className="muted abordagem-script-test-split-hint">
                    Edite o roteiro à esquerda e conduza o teste à direita. Alterações aqui refletem no simulador; use
                    &quot;Reiniciar etapas&quot; no painel se mudar a ordem das etapas.
                  </p>
                </div>
                <button type="button" className="btn cadastro-modal-close" onClick={closeScriptModal} aria-label="Fechar">
                  ×
                </button>
              </header>
              <div className="abordagem-script-test-split-editor-body ui-scroll ui-scroll-elevated">
                {scriptEditorForm}
              </div>
            </div>
            <div className="abordagem-script-test-split-sim">
              <ResultadoComercialSimulatorPanel
                embedded
                open
                draftScript={liveSimulatorDraft}
                onClose={() => setSimulatorOpen(false)}
              />
            </div>
          </div>
        ) : (
          <CadastroModal
            open
            title={scriptEditingId ? "Editar script" : "Novo script / modelo"}
            onClose={closeScriptModal}
            extraWide
          >
            {scriptEditorForm}
          </CadastroModal>
        )
      ) : null}
    </div>
  );
}
