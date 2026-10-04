"use client";

import { useEffect, useMemo, useState } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { TemplatePlaceholderHelp } from "@/components/template-placeholder-help";
import {
  DEFAULT_CAPTURE_FIELDS,
  contactRegisterFields,
  defaultEmptyCallFlow,
  draftsToScreenFlow,
  ensureInternalScreenIds,
  newScreenBlock,
  parseCallScriptBody,
  screenFlowToDrafts,
  SCRIPT_BLOCK_LABELS,
  serializeCallScriptFlow,
  type ScriptFlowCaptureField,
  type ScriptScreenBlock,
  type ScriptScreenDraft
} from "@/lib/script-flow";

type Props = {
  body: string;
  onBodyChange: (body: string) => void;
  /** Abordagens: abre/fecha simulador ao lado do editor. */
  testSplitActive?: boolean;
  onTestToggle?: () => void;
};

function newInternalScreenId(existing: ScriptScreenDraft[]) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const id = `scr_${Math.random().toString(36).slice(2, 10)}`;
    if (!existing.some((s) => s.id === id)) return id;
  }
  return `scr_${Date.now()}`;
}

export function ScriptFlowEditor({ body, onBodyChange, testSplitActive, onTestToggle }: Props) {
  const parsed = useMemo(() => parseCallScriptBody(body), [body]);
  const [drafts, setDrafts] = useState<ScriptScreenDraft[]>(() => {
    const base = parsed ? screenFlowToDrafts(parsed) : screenFlowToDrafts(defaultEmptyCallFlow());
    return ensureInternalScreenIds(base);
  });
  const [selectedId, setSelectedId] = useState<string | null>(drafts[0]?.id ?? null);
  const [dragBlockId, setDragBlockId] = useState<string | null>(null);
  const [dropBlockId, setDropBlockId] = useState<string | null>(null);

  useEffect(() => {
    if (drafts.length === 0) return;
    onBodyChange(serializeCallScriptFlow(draftsToScreenFlow(drafts)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts]);

  const selected = drafts.find((d) => d.id === selectedId) ?? drafts[0] ?? null;
  const screenIds = drafts.map((d) => d.id);
  const selectedOrder = selected ? drafts.findIndex((d) => d.id === selected.id) + 1 : 1;
  const navMode = selected?.navigation.mode ?? "sequential";

  function updateSelected(patch: Partial<ScriptScreenDraft>) {
    if (!selected) return;
    setDrafts((list) => list.map((d) => (d.id === selected.id ? { ...d, ...patch } : d)));
  }

  function updateBlock(blockId: string, patch: Partial<ScriptScreenBlock>) {
    if (!selected) return;
    setDrafts((list) =>
      list.map((d) => {
        if (d.id !== selected.id) return d;
        return {
          ...d,
          blocks: d.blocks.map((b) => (b.id === blockId ? ({ ...b, ...patch } as ScriptScreenBlock) : b))
        };
      })
    );
  }

  function removeBlock(blockId: string) {
    if (!selected) return;
    updateSelected({ blocks: selected.blocks.filter((b) => b.id !== blockId) });
  }

  function reorderBlocks(fromId: string, toId: string) {
    if (!selected || fromId === toId) return;
    setDrafts((list) =>
      list.map((d) => {
        if (d.id !== selected.id) return d;
        const fromIdx = d.blocks.findIndex((b) => b.id === fromId);
        const toIdx = d.blocks.findIndex((b) => b.id === toId);
        if (fromIdx < 0 || toIdx < 0) return d;
        const blocks = [...d.blocks];
        const [item] = blocks.splice(fromIdx, 1);
        blocks.splice(toIdx, 0, item!);
        return { ...d, blocks };
      })
    );
  }

  function addBlock(kind: ScriptScreenBlock["kind"]) {
    if (!selected) return;
    updateSelected({ blocks: [...selected.blocks, newScreenBlock(kind)] });
  }

  function moveScreenToOrder(internalId: string, targetOrder: number) {
    setDrafts((list) => {
      const fromIdx = list.findIndex((d) => d.id === internalId);
      if (fromIdx < 0) return list;
      const toIdx = Math.max(0, Math.min(list.length - 1, targetOrder - 1));
      if (fromIdx === toIdx) return list;
      const copy = [...list];
      const [item] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, item!);
      return copy;
    });
  }

  function addScreen() {
    const id = newInternalScreenId(drafts);
    const next: ScriptScreenDraft = {
      id,
      title: `Tela ${drafts.length + 1}`,
      blocks: [newScreenBlock("text")],
      navigation: { mode: "sequential", next: null }
    };
    setDrafts((list) => {
      if (list.length === 0) return [next];
      const updated = list.map((d, i) => {
        if (i !== list.length - 1) return d;
        if (d.navigation.mode === "sequential" && (d.navigation.next == null || d.navigation.next === "")) {
          return { ...d, navigation: { mode: "sequential" as const, next: id } };
        }
        return d;
      });
      return [...updated, next];
    });
    setSelectedId(id);
  }

  function removeScreen(id: string) {
    setDrafts((list) => {
      const next = list.filter((d) => d.id !== id);
      for (const d of next) {
        if (d.navigation.mode === "sequential" && d.navigation.next === id) {
          d.navigation = { mode: "sequential", next: null };
        }
        if (d.navigation.mode === "branch") {
          d.navigation = {
            ...d.navigation,
            choices: d.navigation.choices.map((c) => (c.next === id ? { ...c, next: null } : c))
          };
        }
      }
      return next;
    });
    if (selectedId === id) setSelectedId(drafts.find((d) => d.id !== id)?.id ?? null);
  }

  function screenLabel(id: string) {
    const idx = drafts.findIndex((x) => x.id === id);
    const d = idx >= 0 ? drafts[idx] : undefined;
    const title = d?.title?.trim() || "Tela";
    return idx >= 0 ? `${title} (ordem ${idx + 1})` : title;
  }

  function sequentialNextSelectValue(d: ScriptScreenDraft, index: number): string {
    if (d.navigation.mode !== "sequential") return "";
    if (d.navigation.nextIsEnd) return "";
    if (d.navigation.next) return d.navigation.next;
    const implicit = index < drafts.length - 1 ? drafts[index + 1]!.id : "";
    return implicit;
  }

  function setNavigationMode(mode: "sequential" | "branch") {
    if (!selected) return;
    if (mode === "branch") {
      updateSelected({
        navigation: {
          mode: "branch",
          question: selected.navigation.mode === "branch" ? selected.navigation.question : "Como seguir?",
          choices:
            selected.navigation.mode === "branch"
              ? selected.navigation.choices
              : [
                  { label: "Sim", next: null },
                  { label: "Não", next: null }
                ]
        }
      });
    } else {
      const prev = selected.navigation.mode === "sequential" ? selected.navigation : null;
      updateSelected({
        navigation: {
          mode: "sequential",
          next: prev?.next ?? null,
          ...(prev?.nextIsEnd ? { nextIsEnd: true } : {})
        }
      });
    }
  }

  return (
    <div className="script-flow-editor">
      <div className="script-flow-layout">
        <aside className="script-flow-steps">
          <div className="script-flow-steps-head">
            <span className="label">Telas</span>
            <div className="script-flow-steps-actions">
              <button type="button" className="btn btn-icon-sm" onClick={addScreen} title="Nova tela">
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
          {onTestToggle ? (
            <div className="script-flow-steps-foot">
              <button type="button" className="btn btn-result-test script-flow-steps-test-btn" onClick={onTestToggle}>
                <span className="btn-result-test-icon" aria-hidden>
                  {testSplitActive ? "◀" : "▶"}
                </span>
                {testSplitActive ? "Ocultar teste" : "Testar"}
              </button>
            </div>
          ) : null}
        </aside>

        {selected ? (
          <div className="script-flow-step-panel panel">
            <div className="script-flow-step-panel-head">
              <span className="label">Editar tela</span>
              <button type="button" className="btn btn-icon-sm" onClick={() => removeScreen(selected.id)} title="Remover tela">
                <Trash2 size={16} />
              </button>
            </div>
            <div className="field">
              <label className="label" htmlFor="script-screen-order">
                Ordem
              </label>
              <input
                id="script-screen-order"
                className="input"
                type="number"
                min={1}
                max={drafts.length}
                value={selectedOrder}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) moveScreenToOrder(selected.id, Math.round(n));
                }}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="script-screen-title">
                Título da tela
              </label>
              <input
                id="script-screen-title"
                className="input"
                value={selected.title}
                onChange={(e) => updateSelected({ title: e.target.value })}
              />
            </div>

            <div className="script-flow-screen-section">
              <div className="script-flow-screen-section-head">
                <span className="label">Conteúdo da tela</span>
                <div className="script-flow-block-add-row">
                  {(Object.keys(SCRIPT_BLOCK_LABELS) as ScriptScreenBlock["kind"][]).map((kind) => (
                    <button key={kind} type="button" className="btn btn-sm" onClick={() => addBlock(kind)}>
                      + {SCRIPT_BLOCK_LABELS[kind].split(" (")[0]}
                    </button>
                  ))}
                </div>
              </div>
              {selected.blocks.length === 0 ? (
                <p className="muted script-flow-field-hint">Adicione ao menos um bloco (ex.: Texto).</p>
              ) : selected.blocks.length >= 2 ? (
                <p className="muted script-flow-field-hint">Arraste pelo ícone ⋮⋮ para reordenar os blocos nesta tela.</p>
              ) : null}
              {selected.blocks.map((block) => {
                const canReorder = selected.blocks.length >= 2;
                const isDropTarget = dropBlockId === block.id && dragBlockId !== block.id;
                return (
                <div
                  key={block.id}
                  className={`script-flow-block-card panel${isDropTarget ? " script-flow-block-card--drop-target" : ""}${dragBlockId === block.id ? " script-flow-block-card--dragging" : ""}`}
                  onDragOver={(e) => {
                    if (!canReorder || !dragBlockId || dragBlockId === block.id) return;
                    e.preventDefault();
                    setDropBlockId(block.id);
                  }}
                  onDragLeave={() => {
                    if (dropBlockId === block.id) setDropBlockId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = e.dataTransfer.getData("text/plain") || dragBlockId;
                    if (from && from !== block.id) reorderBlocks(from, block.id);
                    setDragBlockId(null);
                    setDropBlockId(null);
                  }}
                >
                  <div className="script-flow-block-card-head">
                    <div className="script-flow-block-card-head-title">
                      {canReorder ? (
                        <button
                          type="button"
                          className="script-flow-block-drag-handle btn btn-icon-sm"
                          draggable
                          title="Arrastar para reordenar"
                          aria-label="Arrastar bloco para reordenar"
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", block.id);
                            e.dataTransfer.effectAllowed = "move";
                            setDragBlockId(block.id);
                          }}
                          onDragEnd={() => {
                            setDragBlockId(null);
                            setDropBlockId(null);
                          }}
                        >
                          <GripVertical size={16} aria-hidden />
                        </button>
                      ) : null}
                      <strong>{SCRIPT_BLOCK_LABELS[block.kind]}</strong>
                    </div>
                    <button type="button" className="btn btn-icon-sm" title="Remover bloco" onClick={() => removeBlock(block.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {block.kind === "text" ? (
                    <div className="field">
                      <div className="label-with-help">
                        <label className="label">Texto / fala sugerida</label>
                        <TemplatePlaceholderHelp showFlowNote />
                      </div>
                      <textarea
                        className="textarea script-flow-textarea"
                        rows={4}
                        value={block.content}
                        onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                      />
                    </div>
                  ) : null}
                  {block.kind === "notes" ? (
                    <>
                      <p className="muted script-flow-field-hint">
                        Campos salvos na ligação e no complemento de registro. Vínculo Nome/Cargo preenche o registro
                        final.
                      </p>
                      {(block.fields ?? DEFAULT_CAPTURE_FIELDS).map((field, idx) => (
                        <div key={idx} className="filters-row script-flow-capture-row">
                          <div className="field" style={{ flex: 1 }}>
                            <label className="label">Rótulo</label>
                            <input
                              className="input"
                              value={field.label}
                              onChange={(e) => {
                                const fields = [...(block.fields ?? DEFAULT_CAPTURE_FIELDS)];
                                fields[idx] = { ...fields[idx]!, label: e.target.value };
                                updateBlock(block.id, { fields });
                              }}
                            />
                          </div>
                          <div className="field" style={{ minWidth: "8.5rem" }}>
                            <label className="label">Vínculo</label>
                            <select
                              className="select"
                              value={field.key === "nome" ? "nome" : field.key === "cargo" ? "cargo" : ""}
                              onChange={(e) => {
                                const fields = [...(block.fields ?? DEFAULT_CAPTURE_FIELDS)];
                                const link = e.target.value;
                                const base = fields[idx]!;
                                if (link === "nome") {
                                  fields[idx] = { ...base, key: "nome", label: base.label || "Nome", input: "text" };
                                } else if (link === "cargo") {
                                  fields[idx] = {
                                    ...base,
                                    key: "cargo",
                                    label: base.label || "Função / cargo",
                                    input: "text"
                                  };
                                } else {
                                  fields[idx] = {
                                    ...base,
                                    key: base.key === "nome" || base.key === "cargo" ? `campo_${idx + 1}` : base.key
                                  };
                                }
                                updateBlock(block.id, { fields });
                              }}
                            >
                              <option value="">Campo livre</option>
                              <option value="nome">Nome (complemento)</option>
                              <option value="cargo">Cargo (complemento)</option>
                            </select>
                          </div>
                          <div className="field" style={{ width: "7rem" }}>
                            <label className="label">Tipo</label>
                            <select
                              className="select"
                              value={field.input ?? "text"}
                              onChange={(e) => {
                                const fields = [...(block.fields ?? DEFAULT_CAPTURE_FIELDS)];
                                fields[idx] = {
                                  ...fields[idx]!,
                                  input: e.target.value as ScriptFlowCaptureField["input"]
                                };
                                updateBlock(block.id, { fields });
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
                            onClick={() => {
                              const fields = (block.fields ?? DEFAULT_CAPTURE_FIELDS).filter((_, i) => i !== idx);
                              updateBlock(block.id, {
                                fields: fields.length ? fields : [...DEFAULT_CAPTURE_FIELDS]
                              });
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
                          updateBlock(block.id, {
                            fields: [
                              ...(block.fields ?? DEFAULT_CAPTURE_FIELDS),
                              {
                                key: `campo_${(block.fields?.length ?? 3) + 1}`,
                                label: "Novo campo",
                                input: "text"
                              }
                            ]
                          })
                        }
                      >
                        + Campo
                      </button>
                    </>
                  ) : null}
                  {block.kind === "contact_register" ? (
                    <>
                      <p className="muted script-flow-field-hint">
                        Na ligação: nome, cargo/função e telefone. A tag abaixo só orienta o cadastro no cliente.
                      </p>
                      {contactRegisterFields(block).map((field) => (
                        <div key={field.key} className="filters-row script-flow-capture-row">
                          <div className="field" style={{ flex: 1 }}>
                            <label className="label">
                              Rótulo — {field.key === "nome" ? "Nome" : field.key === "cargo" ? "Cargo" : "Telefone"}
                            </label>
                            <input
                              className="input"
                              value={field.label}
                              onChange={(e) => {
                                const fields = contactRegisterFields(block).map((f) =>
                                  f.key === field.key ? { ...f, label: e.target.value } : f
                                );
                                updateBlock(block.id, { fields });
                              }}
                            />
                          </div>
                          <div className="field" style={{ flex: 1 }}>
                            <label className="label">Placeholder</label>
                            <input
                              className="input"
                              value={field.placeholder ?? ""}
                              onChange={(e) => {
                                const fields = contactRegisterFields(block).map((f) =>
                                  f.key === field.key ? { ...f, placeholder: e.target.value } : f
                                );
                                updateBlock(block.id, { fields });
                              }}
                            />
                          </div>
                        </div>
                      ))}
                      <div className="field">
                        <label className="label">Tag no cadastro (técnico)</label>
                        <input
                          className="input"
                          value={block.contact_profile_tag ?? "PERFIL DECISOR"}
                          maxLength={80}
                          onChange={(e) => updateBlock(block.id, { contact_profile_tag: e.target.value })}
                        />
                      </div>
                    </>
                  ) : null}
                  {block.kind === "schedule_meeting" || block.kind === "schedule_return" ? (
                    <div className="field">
                      <label className="label">Instrução (opcional)</label>
                      <input
                        className="input"
                        value={block.prompt ?? ""}
                        placeholder={
                          block.kind === "schedule_meeting"
                            ? "Data e hora da reunião"
                            : "Data e hora do retorno"
                        }
                        onChange={(e) => updateBlock(block.id, { prompt: e.target.value })}
                      />
                    </div>
                  ) : null}
                </div>
                );
              })}
            </div>

            <div className="script-flow-screen-section">
              <span className="label">Navegação após a tela</span>
              <div className="script-flow-nav-mode-row">
                <label className="script-flow-nav-mode-opt">
                  <input
                    type="radio"
                    name={`nav-${selected.id}`}
                    checked={navMode === "sequential"}
                    onChange={() => setNavigationMode("sequential")}
                  />
                  <span>Sequencial (botão Próximo)</span>
                </label>
                <label className="script-flow-nav-mode-opt">
                  <input
                    type="radio"
                    name={`nav-${selected.id}`}
                    checked={navMode === "branch"}
                    onChange={() => setNavigationMode("branch")}
                  />
                  <span>Ramificações (perguntas com opções)</span>
                </label>
              </div>

              <p className="muted script-flow-field-hint" style={{ marginTop: 0 }}>
                Reunião e retorno são blocos em <strong>Conteúdo da tela</strong>, não nas opções de ramificação.
              </p>
              {navMode === "sequential" ? (
                <div className="field">
                  <label className="label">Próxima tela</label>
                  <select
                    className="select"
                    value={
                      selected.navigation.mode === "sequential"
                        ? sequentialNextSelectValue(selected, selectedOrder - 1)
                        : ""
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) {
                        updateSelected({
                          navigation: { mode: "sequential", next: null, nextIsEnd: true }
                        });
                        return;
                      }
                      updateSelected({
                        navigation: { mode: "sequential", next: v, nextIsEnd: false }
                      });
                    }}
                  >
                    <option value="">Fim do fluxo</option>
                    {screenIds
                      .filter((id) => id !== selected.id)
                      .map((id) => (
                        <option key={id} value={id}>
                          {screenLabel(id)}
                        </option>
                      ))}
                  </select>
                </div>
              ) : selected.navigation.mode === "branch" ? (
                <>
                  <div className="field">
                    <label className="label">Pergunta</label>
                    <input
                      className="input"
                      value={selected.navigation.question}
                      onChange={(e) => {
                        const nav = selected.navigation;
                        if (nav.mode !== "branch") return;
                        updateSelected({
                          navigation: { mode: "branch", question: e.target.value, choices: nav.choices }
                        });
                      }}
                    />
                  </div>
                  {selected.navigation.choices.map((choice, idx) => {
                    const branchNav = selected.navigation.mode === "branch" ? selected.navigation : null;
                    if (!branchNav) return null;
                    return (
                    <div key={idx} className="filters-row script-flow-branch-row">
                      <div className="field" style={{ flex: 1 }}>
                        <label className="label">Opção {idx + 1}</label>
                        <input
                          className="input"
                          value={choice.label}
                          onChange={(e) => {
                            const choices = [...branchNav.choices];
                            choices[idx] = { ...choices[idx]!, label: e.target.value };
                            updateSelected({
                              navigation: { mode: "branch", question: branchNav.question, choices }
                            });
                          }}
                        />
                      </div>
                      <div className="field" style={{ minWidth: "9.5rem" }}>
                        <label className="label">Contato no registro</label>
                        <select
                          className="select"
                          value={choice.contact_layer ?? ""}
                          onChange={(e) => {
                            const choices = [...branchNav.choices];
                            const v = e.target.value;
                            choices[idx] = {
                              ...choices[idx]!,
                              contact_layer:
                                v === "decisor" || v === "outra" || v === "ninguem" ? v : undefined
                            };
                            updateSelected({
                              navigation: { mode: "branch", question: branchNav.question, choices }
                            });
                          }}
                        >
                          <option value="">Não preencher</option>
                          <option value="decisor">Decisor</option>
                          <option value="outra">Outra pessoa</option>
                          <option value="ninguem">Ninguém</option>
                        </select>
                      </div>
                    <div className="field" style={{ flex: 1 }}>
                        <label className="label">Ir para</label>
                        <select
                          className="select"
                          value={choice.next ?? ""}
                          onChange={(e) => {
                            const choices = [...branchNav.choices];
                            choices[idx] = { ...choices[idx]!, next: e.target.value || null };
                            updateSelected({
                              navigation: { mode: "branch", question: branchNav.question, choices }
                            });
                          }}
                        >
                          <option value="">Fim</option>
                          {screenIds
                            .filter((id) => id !== selected.id)
                            .map((id) => (
                              <option key={id} value={id}>
                                {screenLabel(id)}
                              </option>
                            ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        className="btn btn-icon-sm"
                        onClick={() => {
                          const choices = branchNav.choices.filter((_, i) => i !== idx);
                          updateSelected({
                            navigation: { mode: "branch", question: branchNav.question, choices }
                          });
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    );
                  })}
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      if (selected.navigation.mode !== "branch") return;
                      updateSelected({
                        navigation: {
                          mode: "branch",
                          question: selected.navigation.question,
                          choices: [...selected.navigation.choices, { label: "Nova opção", next: null }]
                        }
                      });
                    }}
                  >
                    + Opção
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="muted script-flow-empty">Adicione uma tela para começar o fluxo.</p>
        )}
      </div>
    </div>
  );
}
