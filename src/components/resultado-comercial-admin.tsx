"use client";

import clsx from "clsx";
import { useCallback, useEffect, useState } from "react";
import { CadastroModal, CadastroPageHeader, CadastroRowActions, requestCadastroDelete } from "@/components/cadastro-ui";
import { LeadQualificationBadge, LeadQualificationLabel } from "@/components/lead-qualification-picker";
import {
  deriveSuggestFollowUpFromRules,
  formatAllowedNextActionsSummary,
  parseAllowedNextActions,
  resolveAllowedNextActions,
  RESULT_REGISTRATION_ACTION_KEYS,
  APPROACH_NEXT_ACTION_LABELS,
  type ApproachNextActionKey
} from "@/lib/approach-next-actions";
import {
  LEAD_QUALIFICATION_CSS,
  LEAD_QUALIFICATION_ORDER,
  type LeadQualification
} from "@/lib/lead-qualification";
import { ResultadoComercialSimulatorPanel } from "@/components/resultado-comercial-simulator-panel";
import "./resultado-comercial-admin.css";

type ResultRow = {
  id: number;
  name: string;
  slug: string;
  layer?: string;
  description?: string | null;
  status: string;
  suggest_follow_up: boolean;
  lead_qualification: LeadQualification | null;
  collect_notes: boolean;
  require_schedule_return: boolean;
  require_final_registration: boolean;
  ask_decision_maker?: boolean;
  mark_phone_verified?: boolean;
  allowed_next_actions?: unknown;
};

type ResultForm = {
  name: string;
  slug: string;
  status: "active" | "inactive";
  suggest_follow_up: boolean;
  lead_qualification: LeadQualification | "";
  collect_notes: boolean;
  require_schedule_return: boolean;
  require_final_registration: boolean;
  ask_decision_maker: boolean;
  mark_phone_verified: boolean;
  allowed_next_actions: ApproachNextActionKey[];
};

function normalizeAllowedForForm(row: Pick<ResultRow, "allowed_next_actions" | "require_schedule_return" | "suggest_follow_up">) {
  const parsed = parseAllowedNextActions(row.allowed_next_actions);
  if (parsed.length > 0) return parsed.filter((k) => RESULT_REGISTRATION_ACTION_KEYS.includes(k));
  return resolveAllowedNextActions(row).filter((k) => RESULT_REGISTRATION_ACTION_KEYS.includes(k));
}

export function ResultadoComercialAdmin({
  canDelete = false,
  commercialOnly = false
}: {
  canDelete?: boolean;
  commercialOnly?: boolean;
}) {
  const [results, setResults] = useState<ResultRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [resultModal, setResultModal] = useState(false);
  const [resultEditingId, setResultEditingId] = useState<number | null>(null);
  const [resultForm, setResultForm] = useState<ResultForm>({
    name: "",
    slug: "",
    status: "active",
    suggest_follow_up: false,
    lead_qualification: "",
    collect_notes: false,
    require_schedule_return: false,
    require_final_registration: true,
    ask_decision_maker: false,
    mark_phone_verified: false,
    allowed_next_actions: ["none"]
  });
  const [resultSaving, setResultSaving] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/approach-result-types").then((res) => res.json());
    const rows = (r as { items: ResultRow[] }).items ?? [];
    setResults(commercialOnly ? rows.filter((x) => x.layer !== "legacy_telephony") : rows);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openResultCreate() {
    setResultEditingId(null);
    setResultForm({
      name: "",
      slug: "",
      status: "active",
      suggest_follow_up: false,
      lead_qualification: "",
      collect_notes: false,
      require_schedule_return: false,
      require_final_registration: true,
      ask_decision_maker: false,
      mark_phone_verified: false,
      allowed_next_actions: ["none"]
    });
    setError(null);
    setResultModal(true);
  }

  function openResultEdit(row: ResultRow) {
    setResultEditingId(row.id);
    setResultForm({
      name: row.name,
      slug: "",
      status: row.status as "active" | "inactive",
      suggest_follow_up: row.suggest_follow_up,
      lead_qualification: row.lead_qualification ?? "",
      collect_notes: row.collect_notes === true,
      require_schedule_return: row.require_schedule_return === true,
      require_final_registration: row.require_final_registration !== false,
      ask_decision_maker: row.ask_decision_maker === true,
      mark_phone_verified: row.mark_phone_verified === true,
      allowed_next_actions: normalizeAllowedForForm(row)
    });
    setError(null);
    setResultModal(true);
  }

  function toggleAllowedAction(key: ApproachNextActionKey) {
    setResultForm((f) => {
      if (f.require_schedule_return && key === "schedule_return") return f;
      const set = new Set(f.allowed_next_actions);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      let next = RESULT_REGISTRATION_ACTION_KEYS.filter((k) => set.has(k));
      if (next.length === 0) next = ["none"];
      return { ...f, allowed_next_actions: next };
    });
  }

  async function saveResult(e: React.FormEvent) {
    e.preventDefault();
    setResultSaving(true);
    setError(null);
    const url = resultEditingId ? `/api/approach-result-types/${resultEditingId}` : "/api/approach-result-types";
    const method = resultEditingId ? "PATCH" : "POST";
    const qualPayload =
      resultForm.lead_qualification === "cold" ||
      resultForm.lead_qualification === "warm" ||
      resultForm.lead_qualification === "hot"
        ? resultForm.lead_qualification
        : null;
    let allowed = [...resultForm.allowed_next_actions];
    if (resultForm.require_schedule_return && !allowed.includes("schedule_return")) {
      allowed = ["schedule_return", ...allowed.filter((k) => k !== "schedule_return")];
    }
    const editingRow = resultEditingId ? results.find((r) => r.id === resultEditingId) : null;
    const requireFinalRegistration =
      editingRow != null ? editingRow.require_final_registration !== false : true;

    const rulesPayload = {
      require_schedule_return: resultForm.require_schedule_return,
      require_final_registration: requireFinalRegistration,
      allowed_next_actions: allowed
    };
    const suggestFollowUp = deriveSuggestFollowUpFromRules(rulesPayload);
    const body = resultEditingId
      ? {
          name: resultForm.name,
          status: resultForm.status,
          suggest_follow_up: suggestFollowUp,
          lead_qualification: qualPayload,
          collect_notes: resultForm.collect_notes,
          require_schedule_return: resultForm.require_schedule_return,
          require_final_registration: requireFinalRegistration,
          ask_decision_maker: resultForm.ask_decision_maker,
          allowed_next_actions: allowed
        }
      : {
          ...resultForm,
          lead_qualification: qualPayload,
          ask_decision_maker: resultForm.ask_decision_maker,
          require_final_registration: true,
          allowed_next_actions: allowed,
          suggest_follow_up: suggestFollowUp
        };
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

  return (
    <div>
      {error && !resultModal ? <div className="alert alert-error">{error}</div> : null}

      <CadastroPageHeader
        title={commercialOnly ? "Resultados Comerciais" : "Resultado comercial"}
        onNew={openResultCreate}
        newLabel="Novo resultado"
        headerActions={
          <button type="button" className="btn btn-result-test" onClick={() => setSimulatorOpen(true)}>
            <span className="btn-result-test-icon" aria-hidden>
              ▶
            </span>
            Testar
          </button>
        }
      />
      <div className="panel table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Situação</th>
              <th>Qualificação</th>
              <th>Exigir obs.</th>
              <th>Retorno obrig.</th>
              <th>Perg. decisor</th>
              <th>Próximos passos</th>
              <th style={{ width: canDelete ? 120 : 80 }} />
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.status === "active" ? "Ativo" : "Inativo"}</td>
                <td>{r.lead_qualification ? <LeadQualificationBadge value={r.lead_qualification} /> : "—"}</td>
                <td>{r.collect_notes === true ? "Sim" : "—"}</td>
                <td>{r.require_schedule_return ? "Sim" : "—"}</td>
                <td>{r.ask_decision_maker ? "Sim" : "—"}</td>
                <td style={{ fontSize: "0.8125rem", maxWidth: 280 }}>{formatAllowedNextActionsSummary(r)}</td>
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

      <CadastroModal
        open={resultModal}
        title={resultEditingId ? "Editar resultado" : "Novo resultado"}
        onClose={() => setResultModal(false)}
      >
        <form onSubmit={saveResult}>
          {error ? <div className="alert alert-error">{error}</div> : null}

          <div className="resultado-modal-section">
            <p className="resultado-modal-section-title">Identificação</p>
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
              <input
                className="input"
                value={resultForm.name}
                onChange={(e) => setResultForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="label">Situação</label>
              <select
                className="select"
                value={resultForm.status}
                onChange={(e) => setResultForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))}
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </div>
          </div>

          <div className="resultado-modal-section">
            <p className="resultado-modal-section-title">Qualificação do lead</p>
            <p className="muted" style={{ fontSize: "0.8125rem", margin: "0 0 10px" }}>
              Aplicada automaticamente ao salvar a abordagem. O complemento de registro na ligação segue o roteiro e
              as regras de telefonia (ex.: <strong>Sem contato</strong> automático).
            </p>
            <div className="lead-qual-picker" role="group" aria-label="Qualificação do lead">
              {LEAD_QUALIFICATION_ORDER.map((q) => {
                const active = resultForm.lead_qualification === q;
                return (
                  <button
                    key={q}
                    type="button"
                    className={clsx("lead-qual-btn", LEAD_QUALIFICATION_CSS[q], active ? "is-active" : "is-inactive")}
                    onClick={() => setResultForm((f) => ({ ...f, lead_qualification: q }))}
                    aria-pressed={active}
                  >
                    <LeadQualificationLabel value={q} />
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className={clsx("btn resultado-qual-none", !resultForm.lead_qualification && "btn-primary")}
              onClick={() => setResultForm((f) => ({ ...f, lead_qualification: "" }))}
            >
              Sem qualificação automática
            </button>

            <div className="resultado-check-grid" style={{ marginTop: 16 }}>
              <label className="resultado-check-row">
                <input
                  type="checkbox"
                  checked={resultForm.require_schedule_return}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setResultForm((f) => {
                      let allowed = [...f.allowed_next_actions];
                      if (checked) {
                        if (!allowed.includes("schedule_return")) {
                          allowed = ["schedule_return", ...allowed];
                        }
                        allowed = allowed.filter((k) => k !== "none");
                      }
                      return {
                        ...f,
                        require_schedule_return: checked,
                        allowed_next_actions: allowed
                      };
                    });
                  }}
                />
                <span>Exigir agendar retorno</span>
              </label>
              <label className="resultado-check-row">
                <input
                  type="checkbox"
                  checked={resultForm.collect_notes}
                  onChange={(e) => setResultForm((f) => ({ ...f, collect_notes: e.target.checked }))}
                />
                <span>Exigir observações</span>
              </label>
              <label className="resultado-check-row">
                <input
                  type="checkbox"
                  checked={resultForm.ask_decision_maker}
                  onChange={(e) => setResultForm((f) => ({ ...f, ask_decision_maker: e.target.checked }))}
                />
                <span>Pergunta sobre decisor</span>
              </label>
            </div>
            <p className="muted" style={{ fontSize: "0.75rem", margin: "8px 0 0" }}>
              Telefone <strong>Verificado</strong> é aplicado automaticamente quando a ligação é atendida e há contato
              na chamada (não vale para “Sem contato” / ninguém atendeu).
            </p>
          </div>

          <div className="resultado-modal-section">
            <p className="resultado-modal-section-title">Opções disponíveis para registro de resultado</p>
            <div className="resultado-check-grid">
              {RESULT_REGISTRATION_ACTION_KEYS.map((key) => (
                <label key={key} className="resultado-check-row">
                  <input
                    type="checkbox"
                    checked={resultForm.allowed_next_actions.includes(key)}
                    disabled={resultForm.require_schedule_return && key === "schedule_return"}
                    onChange={() => toggleAllowedAction(key)}
                  />
                  <span>{APPROACH_NEXT_ACTION_LABELS[key]}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="resultado-modal-actions">
            <button type="button" className="btn" onClick={() => setResultModal(false)}>
              Cancelar
            </button>
            <button className="btn btn-primary" type="submit" disabled={resultSaving}>
              {resultSaving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </CadastroModal>

      <ResultadoComercialSimulatorPanel open={simulatorOpen} onClose={() => setSimulatorOpen(false)} />
    </div>
  );
}
