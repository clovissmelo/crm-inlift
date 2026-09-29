"use client";

import { FLOW_STEP_CATALOG, type FlowStepKey } from "@/lib/lead-generation/flow-modules";
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

export function AdminLeadGenerationFlows() {
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<FlowRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setSelectedId((prev) => prev ?? list[0]?.id ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const f = flows.find((x) => x.id === selectedId) ?? null;
    setDraft(f ? { ...f, steps: f.steps.map((s) => ({ ...s })) } : null);
  }, [flows, selectedId]);

  function updateStep(index: number, patch: Partial<FlowStep>) {
    setDraft((prev) => {
      if (!prev) return prev;
      const steps = prev.steps.map((s, i) => (i === index ? { ...s, ...patch } : s));
      return { ...prev, steps };
    });
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
    <div className="panel" style={{ marginBottom: "1rem" }}>
      <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Fluxos de geração</h2>
      <p className="muted" style={{ fontSize: "0.88rem" }}>
        Sequência de módulos fixos do sistema (sem código arbitrário). Cada execução grava um snapshot do fluxo no
        momento do início.
      </p>

      {loading ? <p className="muted">Carregando fluxos…</p> : null}
      {message ? <div className="alert alert-info">{message}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

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
            Fonte inicial: <strong>{draft.initial_source}</strong> (definida pelo tipo de fluxo)
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
  );
}
