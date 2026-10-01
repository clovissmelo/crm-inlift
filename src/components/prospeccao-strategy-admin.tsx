"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CallStrategySettings } from "@/lib/call-strategy/settings";
import type { ProspeccaoPriorityTypeRow } from "@/lib/call-strategy/priorities-config";
import {
  OPERATIONAL_ACTION_LABELS,
  type OperationalAction
} from "@/lib/attendance/operational-actions";

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
      pipeline_stage_id: rule.pipeline_stage_id,
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
      pipeline_stage_id: null,
      sort_order: 50
    });
  }

  async function saveRule() {
    if (!form) return;
    setMsg(null);
    const payload = { ...form };
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

  async function savePriority(row: ProspeccaoPriorityTypeRow) {
    setMsg(null);
    const res = await fetch("/api/admin/prospeccao-priorities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: row.id,
        name: row.name,
        description: row.description,
        color: row.color,
        sort_order: row.sort_order
      })
    });
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setMsg(j.error ?? "Erro ao salvar");
      return;
    }
    await load();
    setMsg("Ordem da fila atualizada.");
  }

  if (loading) return <p className="muted">Carregando…</p>;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          className={tab === "rules" ? "btn btn-primary" : "btn"}
          onClick={() => setTab("rules")}
        >
          Regras de atendimento
        </button>
        <button
          type="button"
          className={tab === "queue" ? "btn btn-primary" : "btn"}
          onClick={() => setTab("queue")}
        >
          Ordem da fila
        </button>
      </div>
      {msg ? <p className="muted">{msg}</p> : null}

      {tab === "rules" ? (
        <div>
          <p className="muted" style={{ maxWidth: 720 }}>
            Cada regra define o resultado comercial e a ação operacional. Tentativas, verificação de número e saída da
            fila são aplicadas automaticamente — não há combinações contraditórias de flags.
          </p>
          {settings ? (
            <div className="panel" style={{ padding: 12, marginTop: 12, maxWidth: 420 }}>
              <div className="field">
                <label className="label">Limite de tentativas sem contato (por número)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
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
          ) : null}

          <table className="table" style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Atendeu?</th>
                <th>Resultado</th>
                <th>Ação</th>
                <th>Tentativas</th>
                <th>Etapa do funil</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.answered ? "Sim" : "Não"}</td>
                  <td>{r.name}</td>
                  <td>{r.action_label}</td>
                  <td>{attemptsHint(r.operational_action)}</td>
                  <td>{stageName(r.pipeline_stage_id)}</td>
                  <td>
                    {r.is_system && r.operational_action === "auto_no_contact" ? (
                      <span className="muted">Sistema</span>
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
          <button type="button" className="btn" style={{ marginTop: 12 }} onClick={openNew}>
            Nova regra
          </button>

          {form ? (
            <div className="panel" style={{ padding: 16, marginTop: 16, maxWidth: 520 }}>
              <div className="field">
                <label className="label">Atendeu?</label>
                <select
                  className="input"
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
                    className="input"
                    value={form.operational_action}
                    onChange={(e) =>
                      setForm((f) =>
                        f ? { ...f, operational_action: e.target.value as OperationalAction } : f
                      )
                    }
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
              {form.answered && stageRequired(form.operational_action) ? (
                <div className="field">
                  <label className="label">Etapa do funil</label>
                  <select
                    className="input"
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
                    <option value="">—</option>
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
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
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-primary" onClick={() => void saveRule()}>
                  Salvar
                </button>
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
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "queue" ? (
        <div>
          <p className="muted" style={{ maxWidth: 640 }}>
            A ordem abaixo controla a consulta da fila de prospecção. Retornos com data/hora futura só entram quando
            vencerem.
          </p>
          <table className="table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Ordem</th>
                <th>Nome</th>
                <th>Cor</th>
                <th>Descrição</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {priorities
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((p) => (
                  <tr key={p.id}>
                    <td>
                      <input
                        className="input"
                        type="number"
                        style={{ width: 72 }}
                        value={p.sort_order}
                        onChange={(e) =>
                          setPriorities((rows) =>
                            rows.map((r) =>
                              r.id === p.id ? { ...r, sort_order: Number(e.target.value) } : r
                            )
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        value={p.name}
                        onChange={(e) =>
                          setPriorities((rows) =>
                            rows.map((r) => (r.id === p.id ? { ...r, name: e.target.value } : r))
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        type="color"
                        value={p.color.startsWith("#") ? p.color : "#64748b"}
                        onChange={(e) =>
                          setPriorities((rows) =>
                            rows.map((r) => (r.id === p.id ? { ...r, color: e.target.value } : r))
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        value={p.description ?? ""}
                        onChange={(e) =>
                          setPriorities((rows) =>
                            rows.map((r) =>
                              r.id === p.id ? { ...r, description: e.target.value } : r
                            )
                          )
                        }
                      />
                    </td>
                    <td>
                      <button type="button" className="btn btn-sm" onClick={() => void savePriority(p)}>
                        Salvar
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
