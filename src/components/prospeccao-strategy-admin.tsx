"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CadastroModal } from "@/components/cadastro-ui";
import type { CallStrategySettings } from "@/lib/call-strategy/settings";
import type { ProspeccaoPriorityTypeRow } from "@/lib/call-strategy/priorities-config";
import {
  canDeletePriority,
  CREATABLE_RULE_KINDS,
  isFixedQueueAnchor,
  normalizePrioritySortOrders,
  parseRuleParams,
  PROSPECCAO_RULE_KIND_LABELS,
  ruleKindSummary,
  sortPrioritiesForDisplay,
  type CreatableRuleKind
} from "@/lib/prospeccao-priority-queue-admin";
import {
  defaultPipelineStageNameForAction,
  isFixedProspeccaoFunnelAction,
  OPERATIONAL_ACTION_LABELS,
  PROSPECCAO_PIPELINE_STAGE_NAME,
  type OperationalAction
} from "@/lib/attendance/operational-actions";
import "@/components/prospeccao-admin.css";

type AttendanceRuleItem = {
  id: number;
  answered: boolean;
  name: string;
  slug: string;
  operational_action: OperationalAction;
  pipeline_stage_id: number | null;
  commercial_result_type_id: number | null;
  sort_order: number;
  status: string;
  is_system: boolean;
  action_label: string;
};

type PipelineStage = { id: number; name: string };

const ANSWERED_ACTIONS: OperationalAction[] = [
  "sem_contato",
  "pediu_retorno",
  "demonstrou_interesse",
  "sem_interesse",
  "reuniao_agendada"
];

function attemptsHint(action: OperationalAction): string {
  if (action === "auto_no_contact" || action === "sem_contato") return "Conta no limite sem contato";
  if (action === "sem_interesse" || action === "reuniao_agendada") return "Saída da fila do produto";
  if (action === "pediu_retorno") return "Retorno na fila quando vencer";
  return "—";
}

function stageRequired(action: OperationalAction): boolean {
  return action === "demonstrou_interesse" || action === "reuniao_agendada" || action === "sem_interesse";
}

function funnelStageConfigurable(action: OperationalAction): boolean {
  return stageRequired(action) || action === "pediu_retorno";
}

function prospeccaoStageDisplayName(stages: PipelineStage[]): string {
  const id = defaultStageIdForAction("pediu_retorno", stages);
  if (id) {
    const hit = stages.find((s) => s.id === id);
    if (hit) return hit.name;
  }
  return PROSPECCAO_PIPELINE_STAGE_NAME;
}

function defaultStageIdForAction(action: OperationalAction, stages: PipelineStage[]): number | null {
  const name = defaultPipelineStageNameForAction(action);
  if (!name) return null;
  const hit = stages.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());
  return hit?.id ?? null;
}

function funnelCellLabel(
  rule: AttendanceRuleItem,
  stages: PipelineStage[],
  stageName: (id: number | null) => string
): { text: string; muted?: boolean } {
  if (isFixedProspeccaoFunnelAction(rule.operational_action)) {
    return { text: `${prospeccaoStageDisplayName(stages)} (fixo)`, muted: true };
  }
  if (!rule.answered) return { text: "—", muted: true };
  if (rule.pipeline_stage_id) return { text: stageName(rule.pipeline_stage_id) };
  const suggested = defaultStageIdForAction(rule.operational_action, stages);
  if (suggested) {
    return { text: `${stageName(suggested)} (padrão)`, muted: true };
  }
  if (funnelStageConfigurable(rule.operational_action)) {
    return { text: "Definir em Editar", muted: true };
  }
  return { text: "—", muted: true };
}

export function ProspeccaoStrategyAdmin() {
  const [tab, setTab] = useState<"rules" | "queue">("rules");
  const [rules, setRules] = useState<AttendanceRuleItem[]>([]);
  const [priorities, setPriorities] = useState<ProspeccaoPriorityTypeRow[]>([]);
  const [settings, setSettings] = useState<CallStrategySettings | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<{
    answered: boolean;
    name: string;
    slug: string;
    operational_action: OperationalAction;
    pipeline_stage_id: number | null;
    sort_order: number;
  } | null>(null);
  const [priorityModal, setPriorityModal] = useState<"new" | number | null>(null);
  const [priorityForm, setPriorityForm] = useState<{
    name: string;
    description: string;
    color: string;
    rule_kind: CreatableRuleKind;
    round: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [rRes, pRes, sRes, stRes] = await Promise.all([
      fetch("/api/admin/attendance-rules"),
      fetch("/api/admin/prospeccao-priorities"),
      fetch("/api/admin/call-strategy/settings"),
      fetch("/api/pipeline-stages")
    ]);
    if (rRes.ok) {
      const j = (await rRes.json()) as { items: AttendanceRuleItem[] };
      setRules(j.items);
    }
    if (pRes.ok) {
      const j = (await pRes.json()) as { items: ProspeccaoPriorityTypeRow[] };
      setPriorities(j.items);
    }
    if (sRes.ok) {
      const j = (await sRes.json()) as { settings: CallStrategySettings };
      setSettings(j.settings);
    }
    if (stRes.ok) {
      const j = (await stRes.json()) as { items: PipelineStage[] };
      setStages(j.items ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stageName = useMemo(() => {
    const m = new Map(stages.map((s) => [s.id, s.name]));
    return (id: number | null) => (id ? m.get(id) ?? `#${id}` : "—");
  }, [stages]);

  function openEdit(rule: AttendanceRuleItem) {
    if (rule.is_system && rule.operational_action === "auto_no_contact") return;
    setEditId(rule.id);
    setForm({
      answered: rule.answered,
      name: rule.name,
      slug: rule.slug,
      operational_action: rule.operational_action,
      pipeline_stage_id:
        rule.pipeline_stage_id ??
        (funnelStageConfigurable(rule.operational_action)
          ? defaultStageIdForAction(rule.operational_action, stages)
          : null),
      sort_order: rule.sort_order
    });
  }

  function openNew() {
    setEditId("new");
    setForm({
      answered: true,
      name: "",
      slug: "",
      operational_action: "pediu_retorno",
      pipeline_stage_id: defaultStageIdForAction("pediu_retorno", stages),
      sort_order: 50
    });
  }

  async function saveRule() {
    if (!form) return;
    setMsg(null);
    const payload = {
      ...form,
      pipeline_stage_id: isFixedProspeccaoFunnelAction(form.operational_action)
        ? null
        : form.pipeline_stage_id
    };
    const url =
      editId === "new" ? "/api/admin/attendance-rules" : `/api/admin/attendance-rules/${editId}`;
    const method = editId === "new" ? "POST" : "PATCH";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setMsg(j.error ?? "Erro ao salvar regra");
      return;
    }
    setEditId(null);
    setForm(null);
    await load();
    setMsg("Regra salva.");
  }

  async function saveNoContactLimit() {
    if (!settings) return;
    setMsg(null);
    const res = await fetch("/api/admin/call-strategy/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ max_no_contact_attempts: settings.max_no_contact_attempts })
    });
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setMsg(j.error ?? "Erro ao salvar limite");
      return;
    }
    setMsg("Limite de tentativas sem contato salvo.");
  }

  async function saveAllPriorities() {
    setMsg(null);
    const sorted = normalizePrioritySortOrders(priorities);
    const results = await Promise.all(
      sorted.map((row) =>
        fetch("/api/admin/prospeccao-priorities", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: row.id,
            name: row.name,
            description: row.description,
            color: row.color,
            sort_order: row.sort_order
          })
        })
      )
    );
    if (results.some((r) => !r.ok)) {
      setMsg("Algumas prioridades não foram salvas. Tente novamente.");
      return;
    }
    const lastOk = results.find((r) => r.ok);
    if (lastOk) {
      const j = (await lastOk.json()) as { items: ProspeccaoPriorityTypeRow[] };
      setPriorities(j.items);
    } else {
      await load();
    }
    setMsg("Ordem da fila atualizada.");
  }

  async function savePriority(row: ProspeccaoPriorityTypeRow) {
    setMsg(null);
    if (!isFixedQueueAnchor(row) && (!Number.isFinite(row.sort_order) || row.sort_order < 2)) {
      setMsg("Informe uma ordem válida (número maior que 1).");
      return;
    }
    const res = await fetch("/api/admin/prospeccao-priorities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: row.id,
        name: row.name,
        description: row.description,
        color: row.color,
        ...(isFixedQueueAnchor(row) ? {} : { sort_order: row.sort_order })
      })
    });
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setMsg(j.error ?? "Erro ao salvar");
      return;
    }
    const j = (await res.json()) as { items: ProspeccaoPriorityTypeRow[] };
    setPriorities(j.items);
    setMsg("Ordem da fila atualizada.");
  }

  function openNewPriority() {
    setPriorityModal("new");
    setPriorityForm({
      name: "",
      description: "",
      color: "#64748b",
      rule_kind: "dial_round_tier",
      round: 1
    });
  }

  function openEditPriority(row: ProspeccaoPriorityTypeRow) {
    if (!canDeletePriority(row)) return;
    const params = parseRuleParams(row.rule_params);
    const round = typeof params.round === "number" ? params.round : 1;
    setPriorityModal(row.id);
    setPriorityForm({
      name: row.name,
      description: row.description ?? "",
      color: row.color.startsWith("#") ? row.color : "#64748b",
      rule_kind: (CREATABLE_RULE_KINDS.includes(row.rule_kind as CreatableRuleKind)
        ? row.rule_kind
        : "dial_round_tier") as CreatableRuleKind,
      round
    });
  }

  async function savePriorityModal() {
    if (!priorityForm) return;
    setMsg(null);
    const rule_params =
      priorityForm.rule_kind === "dial_round_tier" ? { round: priorityForm.round } : undefined;
    const payload = {
      name: priorityForm.name,
      description: priorityForm.description.trim() || null,
      color: priorityForm.color,
      rule_kind: priorityForm.rule_kind,
      rule_params
    };

    if (priorityModal === "new") {
      const res = await fetch("/api/admin/prospeccao-priorities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        setMsg(j.error ?? "Erro ao criar prioridade");
        return;
      }
    } else if (typeof priorityModal === "number") {
      const res = await fetch("/api/admin/prospeccao-priorities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: priorityModal, ...payload })
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        setMsg(j.error ?? "Erro ao salvar prioridade");
        return;
      }
    }

    setPriorityModal(null);
    setPriorityForm(null);
    await load();
    setMsg(priorityModal === "new" ? "Prioridade criada." : "Prioridade atualizada.");
  }

  async function deletePriority(row: ProspeccaoPriorityTypeRow) {
    if (!canDeletePriority(row)) return;
    if (!window.confirm(`Excluir a prioridade “${row.name}”?`)) return;
    setMsg(null);
    const res = await fetch(`/api/admin/prospeccao-priorities/${row.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setMsg(j.error ?? "Erro ao excluir");
      return;
    }
    await load();
    setMsg("Prioridade excluída.");
  }

  const sortedRules = useMemo(
    () =>
      rules.slice().sort((a, b) => {
        if (a.answered !== b.answered) return a.answered ? 1 : -1;
        return a.sort_order - b.sort_order || a.id - b.id;
      }),
    [rules]
  );

  const sortedPriorities = useMemo(() => sortPrioritiesForDisplay(priorities), [priorities]);

  if (loading) return <p className="muted">Carregando…</p>;

  const formTitle = editId === "new" ? "Nova regra de atendimento" : "Editar regra de atendimento";

  return (
    <div className="prospeccao-admin">
      <div className="ui-segment" role="tablist" aria-label="Configuração de prospecção">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "rules"}
          className={tab === "rules" ? "ui-segment-btn is-active" : "ui-segment-btn"}
          onClick={() => setTab("rules")}
        >
          Regras de atendimento
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "queue"}
          className={tab === "queue" ? "ui-segment-btn is-active" : "ui-segment-btn"}
          onClick={() => setTab("queue")}
        >
          Ordem da fila
        </button>
      </div>

      {msg ? <p className="prospeccao-admin__toast">{msg}</p> : null}

      {tab === "rules" ? (
        <div>
          <p className="muted prospeccao-admin__intro">
            Cada regra define o resultado comercial e a ação operacional. Tentativas, verificação de número e saída da
            fila são aplicadas automaticamente — sem combinações contraditórias de flags.
          </p>

          {settings ? (
            <div className="prospeccao-admin__toolbar">
              <div className="field prospeccao-admin__limit-field">
                <div>
                  <label className="label">Limite sem contato (por número)</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={20}
                    value={settings.max_no_contact_attempts ?? settings.max_no_answer_attempts}
                    onChange={(e) =>
                      setSettings((s) =>
                        s ? { ...s, max_no_contact_attempts: Number(e.target.value) } : s
                      )
                    }
                  />
                </div>
                <button type="button" className="btn btn-primary" onClick={() => void saveNoContactLimit()}>
                  Salvar limite
                </button>
              </div>
            </div>
          ) : null}

          <div className="panel table-wrap">
            <table className="data-table prospeccao-rules-table">
              <thead>
                <tr>
                  <th style={{ width: "6.5rem" }}>Atendeu?</th>
                  <th>Resultado</th>
                  <th>Ação</th>
                  <th>Tentativas</th>
                  <th style={{ width: "9rem" }}>Funil</th>
                  <th className="prospeccao-rules-actions" style={{ width: "5.5rem" }} />
                </tr>
              </thead>
              <tbody>
                {sortedRules.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span
                        className={
                          r.answered ? "prospeccao-badge prospeccao-badge--yes" : "prospeccao-badge prospeccao-badge--no"
                        }
                      >
                        {r.answered ? "Sim" : "Não"}
                      </span>
                    </td>
                    <td>{r.name}</td>
                    <td>{r.action_label}</td>
                    <td>{attemptsHint(r.operational_action)}</td>
                    <td>
                      {(() => {
                        const cell = funnelCellLabel(r, stages, stageName);
                        return (
                          <span className={cell.muted ? "muted" : undefined} title="Etapa do funil após registrar o resultado">
                            {cell.text}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="prospeccao-rules-actions">
                      {r.is_system && r.operational_action === "auto_no_contact" ? (
                        <span className="prospeccao-badge prospeccao-badge--system">Sistema</span>
                      ) : (
                        <button type="button" className="btn btn-sm" onClick={() => openEdit(r)}>
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="prospeccao-admin__footer-actions">
            <button type="button" className="btn btn-primary" onClick={openNew}>
              Nova regra
            </button>
          </div>

          <CadastroModal
            open={form != null}
            title={formTitle}
            onClose={() => {
              setEditId(null);
              setForm(null);
            }}
          >
            {form ? (
              <>
                <div className="field">
                  <label className="label">Atendeu?</label>
                  <select
                    className="input select"
                    value={form.answered ? "yes" : "no"}
                    onChange={(e) =>
                      setForm((f) =>
                        f
                          ? {
                              ...f,
                              answered: e.target.value === "yes",
                              operational_action:
                                e.target.value === "yes" ? "pediu_retorno" : "auto_no_contact"
                            }
                          : f
                      )
                    }
                  >
                    <option value="yes">Atendeu</option>
                    <option value="no">Não atendeu</option>
                  </select>
                </div>
                <div className="field">
                  <label className="label">Nome do resultado</label>
                  <input
                    className="input"
                    value={form.name}
                    onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))}
                  />
                </div>
                <div className="field">
                  <label className="label">Slug</label>
                  <input
                    className="input"
                    value={form.slug}
                    onChange={(e) => setForm((f) => (f ? { ...f, slug: e.target.value } : f))}
                    disabled={editId !== "new"}
                  />
                </div>
                {form.answered ? (
                  <div className="field">
                    <label className="label">Ação operacional</label>
                    <select
                      className="input select"
                      value={form.operational_action}
                      onChange={(e) => {
                        const next = e.target.value as OperationalAction;
                        setForm((f) => {
                          if (!f) return f;
                          const suggested = defaultStageIdForAction(next, stages);
                          return {
                            ...f,
                            operational_action: next,
                            pipeline_stage_id: funnelStageConfigurable(next)
                              ? (f.pipeline_stage_id ?? suggested)
                              : null
                          };
                        });
                      }}
                    >
                      {ANSWERED_ACTIONS.map((a) => (
                        <option key={a} value={a}>
                          {OPERATIONAL_ACTION_LABELS[a]}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="muted">Não atendimento usa registro automático (sem formulário BDR).</p>
                )}
                {form.answered && isFixedProspeccaoFunnelAction(form.operational_action) ? (
                  <div className="field">
                    <label className="label">Etapa do funil</label>
                    <p className="muted" style={{ margin: 0, fontSize: "0.9375rem" }}>
                      {prospeccaoStageDisplayName(stages)} <span className="muted">(fixo)</span>
                    </p>
                    <p className="muted" style={{ marginTop: "0.35rem", fontSize: "0.8125rem" }}>
                      Permanece na prospecção, como o não atendimento automático — sem mover etapa no funil ao registrar.
                    </p>
                  </div>
                ) : form.answered && funnelStageConfigurable(form.operational_action) ? (
                  <div className="field">
                    <label className="label">Etapa do funil</label>
                    <select
                      className="input select"
                      value={form.pipeline_stage_id ?? ""}
                      onChange={(e) =>
                        setForm((f) =>
                          f
                            ? {
                                ...f,
                                pipeline_stage_id: e.target.value ? Number(e.target.value) : null
                              }
                            : f
                        )
                      }
                    >
                      <option value="">{stageRequired(form.operational_action) ? "Selecione…" : "Selecione a etapa…"}</option>
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <p className="muted" style={{ marginTop: "0.35rem", fontSize: "0.8125rem" }}>
                      {form.operational_action === "pediu_retorno"
                        ? "Ex.: Prospecção enquanto o retorno está na fila — você pode escolher outra etapa se fizer sentido."
                        : "Ao registrar este resultado, o negócio do produto vai para esta etapa."}
                    </p>
                  </div>
                ) : null}
                <div className="field">
                  <label className="label">Ordem</label>
                  <input
                    className="input"
                    type="number"
                    value={form.sort_order}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, sort_order: Number(e.target.value) } : f))
                    }
                  />
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setEditId(null);
                      setForm(null);
                    }}
                  >
                    Cancelar
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => void saveRule()}>
                    Salvar regra
                  </button>
                </div>
              </>
            ) : null}
          </CadastroModal>
        </div>
      ) : null}

      {tab === "queue" ? (
        <div>
          <p className="muted prospeccao-admin__intro">
            Primeiro contato fica sempre na ordem 1 e Retorno sempre por último. Entre
            eles você define quantas faixas quiser (ex.: ligação 1, 2, 3, acompanhamento). Retornos com data/hora futura
            só entram na fila quando vencerem.
          </p>

          <div className="prospeccao-queue-list">
            {sortedPriorities.map((p, index) => {
              const color = p.color.startsWith("#") ? p.color : "#64748b";
              const fixed = isFixedQueueAnchor(p);
              const showMiddleHeader =
                p.queue_anchor === "none" &&
                (index === 0 || sortedPriorities[index - 1]?.queue_anchor !== "none");
              const showEndHeader = p.queue_anchor === "end";
              return (
                <div key={p.id}>
                  {showMiddleHeader ? (
                    <p className="prospeccao-queue-section-title">Prioridades configuráveis</p>
                  ) : null}
                  {showEndHeader ? <p className="prospeccao-queue-section-title">Fixo — fim da fila</p> : null}
                  {p.queue_anchor === "start" ? (
                    <p className="prospeccao-queue-section-title">Fixo — início da fila</p>
                  ) : null}
                  <div
                    className={
                      fixed ? "prospeccao-queue-row prospeccao-queue-row--fixed" : "prospeccao-queue-row"
                    }
                  >
                    <div className="prospeccao-queue-row__order">
                      <span className="prospeccao-queue-row__label">Ordem</span>
                      {fixed ? (
                        <span className="prospeccao-queue-row__order-fixed">
                          {p.queue_anchor === "start" ? "1" : "Última"}
                        </span>
                      ) : (
                        <input
                          className="input"
                          type="number"
                          value={p.sort_order}
                          onChange={(e) => {
                            const n = parseInt(e.target.value, 10);
                            setPriorities((rows) =>
                              rows.map((r) =>
                                r.id === p.id ? { ...r, sort_order: Number.isFinite(n) ? n : r.sort_order } : r
                              )
                            );
                          }}
                        />
                      )}
                    </div>
                    <div>
                      <span className="prospeccao-queue-row__label">Cor</span>
                      <div className="prospeccao-color-picker">
                        <span
                          className="prospeccao-color-picker__swatch"
                          style={{ background: color }}
                          aria-hidden
                        />
                        <input
                          type="color"
                          value={color}
                          aria-label={`Cor de ${p.name}`}
                          onChange={(e) =>
                            setPriorities((rows) =>
                              rows.map((r) => (r.id === p.id ? { ...r, color: e.target.value } : r))
                            )
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <span className="prospeccao-queue-row__label">Nome</span>
                      <input
                        className="input"
                        value={p.name}
                        onChange={(e) =>
                          setPriorities((rows) =>
                            rows.map((r) => (r.id === p.id ? { ...r, name: e.target.value } : r))
                          )
                        }
                      />
                      <span className="prospeccao-queue-preview">
                        <span className="prospeccao-queue-preview__dot" style={{ background: color }} />
                        Prévia na fila
                      </span>
                      <span className="prospeccao-queue-row__rule muted">{ruleKindSummary(p)}</span>
                    </div>
                    <div className="prospeccao-queue-row__desc">
                      <span className="prospeccao-queue-row__label">Descrição</span>
                      <textarea
                        className="textarea"
                        rows={2}
                        value={p.description ?? ""}
                        placeholder="Quando este grupo aparece na fila…"
                        onChange={(e) =>
                          setPriorities((rows) =>
                            rows.map((r) =>
                              r.id === p.id ? { ...r, description: e.target.value || null } : r
                            )
                          )
                        }
                      />
                    </div>
                    <div className="prospeccao-queue-row__actions">
                      {canDeletePriority(p) ? (
                        <>
                          <button type="button" className="btn btn-sm" onClick={() => openEditPriority(p)}>
                            Editar regra
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => void deletePriority(p)}
                          >
                            Excluir
                          </button>
                        </>
                      ) : fixed ? (
                        <span className="prospeccao-badge prospeccao-badge--system">Fixo</span>
                      ) : null}
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => void savePriority(p)}>
                        Salvar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="prospeccao-admin__footer-actions">
            <button type="button" className="btn" onClick={openNewPriority}>
              Nova prioridade
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void saveAllPriorities()}>
              Salvar todas as prioridades
            </button>
          </div>

          <CadastroModal
            open={priorityForm != null}
            title={priorityModal === "new" ? "Nova prioridade na fila" : "Editar prioridade"}
            onClose={() => {
              setPriorityModal(null);
              setPriorityForm(null);
            }}
          >
            {priorityForm ? (
              <>
                <div className="field">
                  <label className="label">Nome na fila</label>
                  <input
                    className="input"
                    value={priorityForm.name}
                    onChange={(e) => setPriorityForm((f) => (f ? { ...f, name: e.target.value } : f))}
                  />
                </div>
                <div className="field">
                  <label className="label">Critério</label>
                  <select
                    className="input select"
                    value={priorityForm.rule_kind}
                    onChange={(e) =>
                      setPriorityForm((f) =>
                        f ? { ...f, rule_kind: e.target.value as CreatableRuleKind } : f
                      )
                    }
                  >
                    {CREATABLE_RULE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {PROSPECCAO_RULE_KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
                {priorityForm.rule_kind === "dial_round_tier" ? (
                  <div className="field">
                    <label className="label">Rodada / ligação nº</label>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={99}
                      value={priorityForm.round}
                      onChange={(e) =>
                        setPriorityForm((f) => (f ? { ...f, round: Number(e.target.value) } : f))
                      }
                    />
                    <p className="muted" style={{ marginTop: "0.35rem", fontSize: "0.8125rem" }}>
                      Conta quando o BDR percorreu todos os números ativos naquela rodada.
                    </p>
                  </div>
                ) : null}
                <div className="field">
                  <label className="label">Cor</label>
                  <input
                    type="color"
                    value={priorityForm.color}
                    onChange={(e) => setPriorityForm((f) => (f ? { ...f, color: e.target.value } : f))}
                  />
                </div>
                <div className="field">
                  <label className="label">Descrição</label>
                  <textarea
                    className="textarea"
                    rows={2}
                    value={priorityForm.description}
                    onChange={(e) =>
                      setPriorityForm((f) => (f ? { ...f, description: e.target.value } : f))
                    }
                  />
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setPriorityModal(null);
                      setPriorityForm(null);
                    }}
                  >
                    Cancelar
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => void savePriorityModal()}>
                    Salvar
                  </button>
                </div>
              </>
            ) : null}
          </CadastroModal>
        </div>
      ) : null}
    </div>
  );
}
