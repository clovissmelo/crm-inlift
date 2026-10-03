"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { TemplatePlaceholderHelp } from "@/components/template-placeholder-help";
import {
  DEFAULT_CAPTURE_FIELDS,
  draftsToFlow,
  flowToDrafts,
  parseCallScriptBody,
  serializeCallScriptFlow,
  type ScriptFlowCaptureField,
  type ScriptFlowStepDraft
} from "@/lib/script-flow";
type Props = {
  body: string;
  onBodyChange: (body: string) => void;
};

function newStepId(existing: ScriptFlowStepDraft[]) {
  let n = 1;
  while (existing.some((s) => s.id === String(n))) n++;
  return String(n);
}

function nextSuggestedId(existing: ScriptFlowStepDraft[]) {
  return newStepId(existing);
}

export function ScriptFlowEditor({ body, onBodyChange }: Props) {
  const parsed = useMemo(() => parseCallScriptBody(body), [body]);
  const [drafts, setDrafts] = useState<ScriptFlowStepDraft[]>(() =>
    parsed ? flowToDrafts(parsed) : flowToDrafts({ v: 1, start: "1", steps: {} })
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
  const suggestedId = nextSuggestedId(drafts);

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
    setDrafts((list) => {
      if (list.length === 0) return [...list, next];
      const updated = list.map((d, i) =>
        i === list.length - 1 &&
        (d.type === "linear" || d.type === "capture") &&
        (d.next == null || d.next === "")
          ? { ...d, next: id }
          : d
      );
      return [...updated, next];
    });
    setSelectedId(id);
  }

  function removeStep(id: string) {
    setDrafts((list) => {
      const next = list.filter((d) => d.id !== id);
      for (const d of next) {
        if ((d.type === "linear" || d.type === "capture") && d.next === id) d.next = null;
        if (d.type === "branch" && d.choices) {
          d.choices = d.choices.map((c) => (c.next === id ? { ...c, next: null } : c));
        }
      }
      return next;
    });
    if (selectedId === id) setSelectedId(drafts.find((d) => d.id !== id)?.id ?? null);
  }

  function stepLabel(id: string) {
    const d = drafts.find((x) => x.id === id);
    return d?.title?.trim() || id;
  }

  return (
    <div className="script-flow-editor">
      <div className="script-flow-layout">
        <aside className="script-flow-steps">
          <div className="script-flow-steps-head">
            <span className="label">Etapas</span>
            <div className="script-flow-steps-actions">
              <button type="button" className="btn btn-icon-sm" onClick={addStep} title="Nova etapa">
                <Plus size={16} />
              </button>
            </div>
          </div>
          <ul className="script-flow-steps-list">
            {drafts.map((d, i) => (
              <li key={d.id}>
                <button
                  type="button"
                  className={`script-flow-step-btn${selected?.id === d.id ? " script-flow-step-btn--active" : ""}`}
                  onClick={() => setSelectedId(d.id)}
                >
                  <span className="script-flow-step-num">{i + 1}</span>
                  <span className="script-flow-step-title">{d.title.slice(0, 36) || d.id}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {selected ? (
          <div className="script-flow-step-panel panel">
            <div className="script-flow-step-panel-head">
              <span className="label">Editar etapa</span>
              <button type="button" className="btn btn-icon-sm" onClick={() => removeStep(selected.id)} title="Remover etapa">
                <Trash2 size={16} />
              </button>
            </div>
            <div className="field">
              <label className="label" htmlFor="script-step-id">
                ID (único)
              </label>
              <input
                id="script-step-id"
                className="input"
                value={selected.id}
                placeholder={String(suggestedId)}
                onChange={(e) => {
                  const newId = e.target.value.replace(/\s+/g, "");
                  setDrafts((list) =>
                    list.map((d) => {
                      if (d.id === selected.id) return { ...d, id: newId };
                      if ((d.type === "linear" || d.type === "capture") && d.next === selected.id) {
                        return { ...d, next: newId };
                      }
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
              <span className="muted script-flow-field-hint">Sugestão para novas etapas: {suggestedId}</span>
            </div>
            <div className="field">
              <label className="label" htmlFor="script-step-title">
                Título da etapa
              </label>
              <input
                id="script-step-title"
                className="input"
                value={selected.title}
                onChange={(e) => updateSelected({ title: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="script-step-type">
                Tipo
              </label>
              <select
                id="script-step-type"
                className="select"
                value={selected.type}
                onChange={(e) => {
                  const type = e.target.value as ScriptFlowStepDraft["type"];
                  if (type === "branch") {
                    updateSelected({
                      type,
                      question: selected.question ?? "Como seguir?",
                      choices: selected.choices ?? [
                        { label: "Sim", next: null },
                        { label: "Não", next: null }
                      ]
                    });
                  } else if (type === "capture") {
                    updateSelected({
                      type,
                      next: selected.next ?? null,
                      fields: selected.fields?.length ? selected.fields : [...DEFAULT_CAPTURE_FIELDS]
                    });
                  } else {
                    updateSelected({ type: "linear", next: selected.next ?? null });
                  }
                }}
              >
                <option value="linear">Sequencial (botão Próximo)</option>
                <option value="capture">Anotação (campos para preencher na ligação)</option>
                <option value="branch">Ramificação (pergunta + opções)</option>
              </select>
            </div>
            <div className="field">
              <div className="label-with-help">
                <label className="label" htmlFor="script-step-content">
                  Texto / fala sugerida
                </label>
                <TemplatePlaceholderHelp showFlowNote />
              </div>
              <textarea
                id="script-step-content"
                className="textarea script-flow-textarea"
                rows={10}
                value={selected.content}
                onChange={(e) => updateSelected({ content: e.target.value })}
              />
            </div>
            {selected.type === "capture" ? (
              <>
                <p className="muted script-flow-field-hint">
                  Defina os campos que o operador preenche durante a ligação (nome, telefone, etc.). Os valores vão para o
                  registro da chamada.
                </p>
                {(selected.fields ?? DEFAULT_CAPTURE_FIELDS).map((field, idx) => (
                  <div key={idx} className="filters-row script-flow-capture-row">
                    <div className="field" style={{ flex: 1 }}>
                      <label className="label">Rótulo do campo</label>
                      <input
                        className="input"
                        value={field.label}
                        onChange={(e) => {
                          const fields = [...(selected.fields ?? DEFAULT_CAPTURE_FIELDS)];
                          fields[idx] = { ...fields[idx]!, label: e.target.value };
                          updateSelected({ fields });
                        }}
                      />
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <label className="label">Placeholder</label>
                      <input
                        className="input"
                        value={field.placeholder ?? ""}
                        onChange={(e) => {
                          const fields = [...(selected.fields ?? DEFAULT_CAPTURE_FIELDS)];
                          fields[idx] = { ...fields[idx]!, placeholder: e.target.value };
                          updateSelected({ fields });
                        }}
                      />
                    </div>
                    <div className="field" style={{ width: "7rem" }}>
                      <label className="label">Tipo</label>
                      <select
                        className="select"
                        value={field.input ?? "text"}
                        onChange={(e) => {
                          const fields = [...(selected.fields ?? DEFAULT_CAPTURE_FIELDS)];
                          fields[idx] = {
                            ...fields[idx]!,
                            input: e.target.value as ScriptFlowCaptureField["input"]
                          };
                          updateSelected({ fields });
                        }}
                      >
                        <option value="text">Texto</option>
                        <option value="tel">Telefone</option>
                        <option value="textarea">Texto longo</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      className="btn btn-icon-sm"
                      title="Remover campo"
                      onClick={() => {
                        const fields = (selected.fields ?? DEFAULT_CAPTURE_FIELDS).filter((_, i) => i !== idx);
                        updateSelected({ fields: fields.length ? fields : [...DEFAULT_CAPTURE_FIELDS] });
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
                      fields: [
                        ...(selected.fields ?? DEFAULT_CAPTURE_FIELDS),
                        { key: `campo_${(selected.fields?.length ?? 3) + 1}`, label: "Novo campo", input: "text" }
                      ]
                    })
                  }
                >
                  + Campo
                </button>
              </>
            ) : null}
            {selected.type === "linear" || selected.type === "capture" ? (
              <div className="field">
                <label className="label" htmlFor="script-step-next">
                  Próxima etapa
                </label>
                <select
                  id="script-step-next"
                  className="select"
                  value={selected.next ?? ""}
                  onChange={(e) => updateSelected({ next: e.target.value || null })}
                >
                  <option value="">Fim do fluxo</option>
                  {stepIds
                    .filter((id) => id !== selected.id)
                    .map((id) => (
                      <option key={id} value={id}>
                        {stepLabel(id)} ({id})
                      </option>
                    ))}
                </select>
              </div>
            ) : selected.type === "branch" ? (
              <>
                <div className="field">
                  <label className="label" htmlFor="script-step-question">
                    Pergunta de ramificação
                  </label>
                  <input
                    id="script-step-question"
                    className="input"
                    value={selected.question ?? ""}
                    onChange={(e) => updateSelected({ question: e.target.value })}
                  />
                </div>
                {(selected.choices ?? []).map((choice, idx) => (
                  <div key={idx} className="filters-row script-flow-branch-row">
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
                              {stepLabel(id)} ({id})
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
            ) : null}
          </div>
        ) : (
          <p className="muted script-flow-empty">Adicione uma etapa para começar o fluxo.</p>
        )}
      </div>
    </div>
  );
}
