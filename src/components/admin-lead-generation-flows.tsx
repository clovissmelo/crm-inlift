"use client";

import { CadastroModal, CadastroPageHeader } from "@/components/cadastro-ui";
import { FLOW_STEP_CATALOG, type FlowInitialSource, type FlowStepKey } from "@/lib/lead-generation/flow-modules";
import { useCallback, useEffect, useState } from "react";

type FlowStep = {
  id: number;
  step_key: FlowStepKey;
  sort_order: number;
  enabled: boolean;
  on_fail: "continue" | "stop";
  max_api_calls: number | null;
};

type FlowRow = {
  id: number;
  slug: string;
  name: string;
  description: string;
  active: boolean;
  initial_source: string;
  steps: FlowStep[];
};

const INITIAL_SOURCE_OPTIONS: { value: FlowInitialSource; label: string; hint: string }[] = [
  {
    value: "anp_retail",
    label: "ANP — revendedores (postos)",
    hint: "Lista postos da API pública ANP por município."
  },
  {
    value: "anp_distributor",
    label: "ANP — distribuidoras",
    hint: "Base dedicada de distribuidoras (parser próprio)."
  },
  {
    value: "google_places_city",
    label: "Google Places na cidade",
    hint: "Descoberta por segmento e município, sem lista ANP inicial."
  }
];

export function AdminLeadGenerationFlows() {
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<FlowRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    name: "",
    description: "",
    initial_source: "anp_retail" as FlowInitialSource,
    active: true
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/lead-generation/flows");
    const data = (await res.json()) as { flows?: FlowRow[]; error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Erro ao carregar fluxos");
      return;
    }
    const list = data.flows ?? [];
    setFlows(list);
    setSelectedId((prev) => {
      if (prev != null && list.some((f) => f.id === prev)) return prev;
      return list[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const f = flows.find((x) => x.id === selectedId) ?? null;
    setDraft(f ? { ...f, steps: f.steps.map((s) => ({ ...s })) } : null);
  }, [flows, selectedId]);

  function openCreate() {
    setError(null);
    setCreateDraft({
      name: "",
      description: "",
      initial_source: "anp_retail",
      active: true
    });
    setCreateOpen(true);
  }

  function updateStep(index: number, patch: Partial<FlowStep>) {
    setDraft((prev) => {
      if (!prev) return prev;
      const steps = prev.steps.map((s, i) => (i === index ? { ...s, ...patch } : s));
      return { ...prev, steps };
    });
  }

  async function createFlow(e: React.FormEvent) {
    e.preventDefault();
    if (!createDraft.name.trim()) {
      setError("Informe o nome do fluxo.");
      return;
    }
    setCreating(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/lead-generation/flows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: createDraft.name.trim(),
        description: createDraft.description.trim() || undefined,
        initial_source: createDraft.initial_source,
        active: createDraft.active
      })
    });
    const data = (await res.json()) as { flow?: FlowRow; error?: string };
    setCreating(false);
    if (!res.ok) {
      setError(data.error ?? "Erro ao criar fluxo");
      return;
    }
    setCreateOpen(false);
    setMessage("Fluxo criado.");
    if (data.flow?.id) setSelectedId(data.flow.id);
    void load();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/lead-generation/flows", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flow_id: draft.id,
        name: draft.name,
        description: draft.description,
        active: draft.active,
        steps: draft.steps.map((s) => ({
          step_key: s.step_key,
          sort_order: s.sort_order,
          enabled: s.enabled,
          on_fail: s.on_fail,
          max_api_calls: s.max_api_calls
        }))
      })
    });
    const data = (await res.json()) as { flow?: FlowRow; error?: string };
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Erro ao salvar");
      return;
    }
    setMessage("Fluxo salvo.");
    void load();
  }

  return (
    <div>
      <CadastroPageHeader
        title="Fluxos de geração"
        description="Sequência de módulos fixos do sistema (sem código arbitrário). Cada execução grava um snapshot do fluxo no momento do início."
        onNew={openCreate}
        newLabel="Novo fluxo"
      />

      <div className="panel" style={{ marginBottom: "1rem" }}>
        {loading ? <p className="muted">Carregando fluxos…</p> : null}
        {message ? <div className="alert alert-info">{message}</div> : null}
        {error ? <div className="alert alert-error">{error}</div> : null}

        {!loading && flows.length === 0 ? (
          <p className="muted">Nenhum fluxo cadastrado. Use <strong>Novo fluxo</strong> para começar.</p>
        ) : null}

        {!loading && draft ? (
          <form onSubmit={save}>
            <div className="field">
              <label className="label" htmlFor="flow-select">
                Fluxo
              </label>
              <select
                id="flow-select"
                className="input"
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(Number(e.target.value))}
              >
                {flows.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                    {!f.active ? " (inativo)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="flow-name">
                Nome
              </label>
              <input
                id="flow-name"
                className="input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="flow-desc">
                Descrição
              </label>
              <textarea
                id="flow-desc"
                className="input"
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
            <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              Ativo
            </label>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Fonte inicial: <strong>{draft.initial_source}</strong> (definida na criação do fluxo)
            </p>

            <div className="table-wrap" style={{ marginTop: "1rem" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ordem</th>
                    <th>Etapa</th>
                    <th>Pré-requisitos</th>
                    <th>Ativa</th>
                    <th>Se falhar</th>
                    <th>Máx. API</th>
                  </tr>
                </thead>
                <tbody>
                  {[...draft.steps]
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((step) => {
                      const i = draft.steps.findIndex((s) => s.step_key === step.step_key);
                      const def = FLOW_STEP_CATALOG[step.step_key];
                      return (
                        <tr key={step.step_key}>
                          <td>
                            <input
                              className="input input-sm"
                              type="number"
                              min={0}
                              max={999}
                              value={step.sort_order}
                              onChange={(e) => updateStep(i, { sort_order: Number(e.target.value) })}
                            />
                          </td>
                          <td>
                            <strong>{def?.label ?? step.step_key}</strong>
                            <div className="muted" style={{ fontSize: "0.8rem" }}>
                              {def?.description}
                            </div>
                          </td>
                          <td className="muted" style={{ fontSize: "0.8rem" }}>
                            {(def?.prerequisites ?? []).join("; ") || "—"}
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              checked={step.enabled}
                              onChange={(e) => updateStep(i, { enabled: e.target.checked })}
                            />
                          </td>
                          <td>
                            <select
                              className="input input-sm"
                              value={step.on_fail}
                              onChange={(e) => updateStep(i, { on_fail: e.target.value as "continue" | "stop" })}
                            >
                              <option value="continue">Continuar</option>
                              <option value="stop">Interromper item</option>
                            </select>
                          </td>
                          <td>
                            <input
                              className="input input-sm"
                              type="number"
                              min={0}
                              placeholder="—"
                              value={step.max_api_calls ?? ""}
                              onChange={(e) =>
                                updateStep(i, {
                                  max_api_calls: e.target.value === "" ? null : Number(e.target.value)
                                })
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: "0.75rem" }} disabled={saving}>
              {saving ? "Salvando…" : "Salvar fluxo"}
            </button>
          </form>
        ) : null}
      </div>

      <CadastroModal open={createOpen} title="Novo fluxo de geração" onClose={() => !creating && setCreateOpen(false)}>
        <form onSubmit={createFlow}>
          {error && createOpen ? <div className="alert alert-error">{error}</div> : null}
          <div className="field">
            <label className="label" htmlFor="new-flow-name">
              Nome
            </label>
            <input
              id="new-flow-name"
              className="input"
              value={createDraft.name}
              onChange={(e) => setCreateDraft((d) => ({ ...d, name: e.target.value }))}
              autoFocus
              disabled={creating}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="new-flow-desc">
              Descrição
            </label>
            <textarea
              id="new-flow-desc"
              className="input"
              rows={2}
              value={createDraft.description}
              onChange={(e) => setCreateDraft((d) => ({ ...d, description: e.target.value }))}
              disabled={creating}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="new-flow-source">
              Fonte inicial
            </label>
            <select
              id="new-flow-source"
              className="input"
              value={createDraft.initial_source}
              onChange={(e) =>
                setCreateDraft((d) => ({ ...d, initial_source: e.target.value as FlowInitialSource }))
              }
              disabled={creating}
            >
              {INITIAL_SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="muted" style={{ fontSize: "0.8125rem", marginTop: "0.35rem" }}>
              {INITIAL_SOURCE_OPTIONS.find((o) => o.value === createDraft.initial_source)?.hint}
            </p>
          </div>
          <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={createDraft.active}
              onChange={(e) => setCreateDraft((d) => ({ ...d, active: e.target.checked }))}
              disabled={creating}
            />
            Ativo
          </label>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
            <button type="button" className="btn" disabled={creating} onClick={() => setCreateOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? "Criando…" : "Criar fluxo"}
            </button>
          </div>
        </form>
      </CadastroModal>
    </div>
  );
}
