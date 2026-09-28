"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  draftsToFlow,
  flowToDrafts,
  parseCallScriptBody,
  serializeCallScriptFlow,
  type ScriptFlow,
  type ScriptFlowStepDraft
} from "@/lib/script-flow";
import { PLACEHOLDER_HELP } from "@/lib/message-templates";

type Props = {
  body: string;
  onBodyChange: (body: string) => void;
};

function newStepId(existing: ScriptFlowStepDraft[]) {
  let n = existing.length + 1;
  while (existing.some((s) => s.id === `step-${n}`)) n++;
  return `step-${n}`;
}

export function ScriptFlowEditor({ body, onBodyChange }: Props) {
  const parsed = useMemo(() => parseCallScriptBody(body), [body]);
  const [drafts, setDrafts] = useState<ScriptFlowStepDraft[]>(() =>
    parsed ? flowToDrafts(parsed) : flowToDrafts({ v: 1, start: "step-1", steps: {} })
  );
  const [selectedId, setSelectedId] = useState<string | null>(drafts[0]?.id ?? null);

  useEffect(() => {
    if (drafts.length === 0) return;
    const flow = draftsToFlow(drafts);
    onBodyChange(serializeCallScriptFlow(flow));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serializa rascunho → body JSON
  }, [drafts]);

  const selected = drafts.find((d) => d.id === selectedId) ?? drafts[0] ?? null;
  const stepIds = drafts.map((d) => d.id);

  function updateSelected(patch: Partial<ScriptFlowStepDraft>) {
    if (!selected) return;
    setDrafts((list) => list.map((d) => (d.id === selected.id ? { ...d, ...patch } : d)));
  }

  function addStep() {
    const id = newStepId(drafts);
    const next: ScriptFlowStepDraft = {
      id,
      type: "linear",
      title: `Etapa ${drafts.length + 1}`,
      content: "",
      next: null
    };
    setDrafts((list) => [...list, next]);
    setSelectedId(id);
  }

  function removeStep(id: string) {
    setDrafts((list) => {
      const next = list.filter((d) => d.id !== id);
      for (const d of next) {
        if (d.type === "linear" && d.next === id) d.next = null;
        if (d.type === "branch" && d.choices) {
          d.choices = d.choices.map((c) => (c.next === id ? { ...c, next: null } : c));
        }
      }
      return next;
    });
    if (selectedId === id) setSelectedId(drafts.find((d) => d.id !== id)?.id ?? null);
  }

  return (
    <div>
      <p className="muted" style={{ fontSize: "0.8125rem", marginTop: 0 }}>
        Fluxo por etapas: texto livre, botão <strong>Próximo</strong> ou ramificações (Sim/Não). Placeholders:{" "}
        {PLACEHOLDER_HELP.map((p) => p.key).join(", ")}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 220px) 1fr", gap: 16, alignItems: "start" }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span className="label">Etapas</span>
            <button type="button" className="btn btn-icon-sm" onClick={addStep} title="Nova etapa">
              <Plus size={16} />
            </button>
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {drafts.map((d, i) => (
              <li key={d.id} style={{ marginBottom: 4 }}>
                <button
                  type="button"
                  className="btn"
                  style={{
                    width: "100%",
                    justifyContent: "flex-start",
                    fontWeight: selected?.id === d.id ? 600 : 400,
                    opacity: selected?.id === d.id ? 1 : 0.85
                  }}
                  onClick={() => setSelectedId(d.id)}
                >
                  {i + 1}. {d.title.slice(0, 28) || d.id}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {selected ? (
          <div className="panel" style={{ padding: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span className="label">Editar etapa</span>
              <button type="button" className="btn btn-icon-sm" onClick={() => removeStep(selected.id)} title="Remover etapa">
                <Trash2 size={16} />
              </button>
            </div>
            <div className="field">
              <label className="label">ID (único, sem espaços)</label>
              <input
                className="input"
                value={selected.id}
                onChange={(e) => {
                  const newId = e.target.value.replace(/\s+/g, "-");
                  setDrafts((list) =>
                    list.map((d) => {
                      if (d.id === selected.id) return { ...d, id: newId };
                      if (d.type === "linear" && d.next === selected.id) return { ...d, next: newId };
                      if (d.type === "branch" && d.choices) {
                        return {
                          ...d,
                          choices: d.choices.map((c) => (c.next === selected.id ? { ...c, next: newId } : c))
                        };
                      }
                      return d;
                    })
                  );
                  setSelectedId(newId);
                }}
              />
            </div>
            <div className="field">
              <label className="label">Título da etapa</label>
              <input className="input" value={selected.title} onChange={(e) => updateSelected({ title: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">Tipo</label>
              <select
                className="select"
                value={selected.type}
                onChange={(e) => {
                  const type = e.target.value as "linear" | "branch";
                  if (type === "branch") {
                    updateSelected({
                      type,
                      question: selected.question ?? "Como seguir?",
                      choices: selected.choices ?? [
                        { label: "Sim", next: null },
                        { label: "Não", next: null }
                      ]
                    });
                  } else {
                    updateSelected({ type, next: selected.next ?? null });
                  }
                }}
              >
                <option value="linear">Sequencial (botão Próximo)</option>
                <option value="branch">Ramificação (pergunta + opções)</option>
              </select>
            </div>
            <div className="field">
              <label className="label">Texto / fala sugerida</label>
              <textarea
                className="textarea"
                rows={8}
                value={selected.content}
                onChange={(e) => updateSelected({ content: e.target.value })}
              />
            </div>
            {selected.type === "linear" ? (
              <div className="field">
                <label className="label">Próxima etapa</label>
                <select
                  className="select"
                  value={selected.next ?? ""}
                  onChange={(e) => updateSelected({ next: e.target.value || null })}
                >
                  <option value="">Fim do fluxo</option>
                  {stepIds
                    .filter((id) => id !== selected.id)
                    .map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <>
                <div className="field">
                  <label className="label">Pergunta de ramificação</label>
                  <input
                    className="input"
                    value={selected.question ?? ""}
                    onChange={(e) => updateSelected({ question: e.target.value })}
                  />
                </div>
                {(selected.choices ?? []).map((choice, idx) => (
                  <div key={idx} className="filters-row" style={{ alignItems: "flex-end" }}>
                    <div className="field" style={{ flex: 1 }}>
                      <label className="label">Opção {idx + 1}</label>
                      <input
                        className="input"
                        value={choice.label}
                        onChange={(e) => {
                          const choices = [...(selected.choices ?? [])];
                          choices[idx] = { ...choices[idx]!, label: e.target.value };
                          updateSelected({ choices });
                        }}
                      />
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <label className="label">Ir para</label>
                      <select
                        className="select"
                        value={choice.next ?? ""}
                        onChange={(e) => {
                          const choices = [...(selected.choices ?? [])];
                          choices[idx] = { ...choices[idx]!, next: e.target.value || null };
                          updateSelected({ choices });
                        }}
                      >
                        <option value="">Fim</option>
                        {stepIds
                          .filter((id) => id !== selected.id)
                          .map((id) => (
                            <option key={id} value={id}>
                              {id}
                            </option>
                          ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      className="btn btn-icon-sm"
                      title="Remover opção"
                      onClick={() => {
                        const choices = (selected.choices ?? []).filter((_, i) => i !== idx);
                        updateSelected({ choices });
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    updateSelected({
                      choices: [...(selected.choices ?? []), { label: "Nova opção", next: null }]
                    })
                  }
                >
                  + Opção
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
