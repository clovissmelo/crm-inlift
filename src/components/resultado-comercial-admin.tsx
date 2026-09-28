"use client";

import { useCallback, useEffect, useState } from "react";
import { CadastroModal, CadastroPageHeader, CadastroRowActions, requestCadastroDelete } from "@/components/cadastro-ui";
import { PageIntro } from "@/components/page-intro";
import {
  APPROACH_NEXT_ACTION_KEYS,
  APPROACH_NEXT_ACTION_LABELS,
  formatAllowedNextActionsSummary,
  parseAllowedNextActions,
  resolveAllowedNextActions,
  type ApproachNextActionKey
} from "@/lib/approach-next-actions";
import { LeadQualificationBadge } from "@/components/lead-qualification-picker";
import { LEAD_QUALIFICATION_LABELS, type LeadQualification } from "@/lib/lead-qualification";

type ResultRow = {
  id: number;
  name: string;
  status: string;
  suggest_follow_up: boolean;
  lead_qualification: LeadQualification | null;
  collect_notes: boolean;
  require_schedule_return: boolean;
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
  allowed_next_actions: ApproachNextActionKey[];
};

function normalizeAllowedForForm(row: Pick<ResultRow, "allowed_next_actions" | "require_schedule_return" | "suggest_follow_up">) {
  const parsed = parseAllowedNextActions(row.allowed_next_actions);
  if (parsed.length > 0) return parsed;
  return resolveAllowedNextActions(row);
}

export function ResultadoComercialAdmin({ canDelete = false }: { canDelete?: boolean }) {
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
    collect_notes: true,
    require_schedule_return: false,
    allowed_next_actions: ["none"]
  });
  const [resultSaving, setResultSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/approach-result-types").then((res) => res.json());
    setResults((r as { items: ResultRow[] }).items ?? []);
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
      collect_notes: true,
      require_schedule_return: false,
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
      collect_notes: row.collect_notes !== false,
      require_schedule_return: row.require_schedule_return === true,
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
      let next = APPROACH_NEXT_ACTION_KEYS.filter((k) => set.has(k));
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
    const body = resultEditingId
      ? {
          name: resultForm.name,
          status: resultForm.status,
          suggest_follow_up: resultForm.suggest_follow_up,
          lead_qualification: qualPayload,
          collect_notes: resultForm.collect_notes,
          require_schedule_return: resultForm.require_schedule_return,
          allowed_next_actions: allowed
        }
      : { ...resultForm, lead_qualification: qualPayload, allowed_next_actions: allowed };
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
      <PageIntro>Tipos de resultado comercial ao registrar ligações, WhatsApp e e-mail.</PageIntro>
      {error && !resultModal ? <div className="alert alert-error">{error}</div> : null}

      <CadastroPageHeader
        title="Resultados de abordagem"
        description="Tipos de resultado ao registrar uma abordagem."
        onNew={openResultCreate}
        newLabel="Novo resultado"
      />
      <div className="panel table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Situação</th>
              <th>Qualificação</th>
              <th>Observações</th>
              <th>Retorno obrig.</th>
              <th>Próximos passos</th>
              <th style={{ width: canDelete ? 180 : 100 }} />
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.status === "active" ? "Ativo" : "Inativo"}</td>
                <td>{r.lead_qualification ? <LeadQualificationBadge value={r.lead_qualification} /> : "—"}</td>
                <td>{r.collect_notes !== false ? "Sim" : "—"}</td>
                <td>{r.require_schedule_return ? "Sim" : "—"}</td>
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
            <input className="input" value={resultForm.name} onChange={(e) => setResultForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="field">
            <label className="label">Situação</label>
            <select className="select" value={resultForm.status} onChange={(e) => setResultForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Qualificação do lead (automática ao salvar)</label>
            <select
              className="select"
              value={resultForm.lead_qualification}
              onChange={(e) =>
                setResultForm((f) => ({
                  ...f,
                  lead_qualification: e.target.value as LeadQualification | ""
                }))
              }
            >
              <option value="">Não alterar / manual futuro</option>
              <option value="cold">Frio — sai da prospecção</option>
              <option value="warm">Morno — permanece no funil</option>
              <option value="hot">Quente — permanece no funil</option>
            </select>
          </div>
          <label style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={resultForm.collect_notes}
              onChange={(e) => setResultForm((f) => ({ ...f, collect_notes: e.target.checked }))}
            />
            Solicitar observações ao registrar
          </label>
          <label style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={resultForm.require_schedule_return}
              onChange={(e) => {
                const checked = e.target.checked;
                setResultForm((f) => {
                  let allowed = [...f.allowed_next_actions];
                  if (checked && !allowed.includes("schedule_return")) {
                    allowed = ["schedule_return", ...allowed];
                  }
                  return {
                    ...f,
                    require_schedule_return: checked,
                    suggest_follow_up: checked ? true : f.suggest_follow_up,
                    allowed_next_actions: allowed
                  };
                });
              }}
            />
            Obrigar agendar retorno
          </label>
          <div className="field">
            <span className="label">Próximos passos disponíveis ao registrar</span>
            <p className="muted" style={{ fontSize: "0.8125rem", margin: "0 0 8px" }}>
              Marque o que o BDR pode escolher após selecionar este resultado (ex.: número inválido → só Nenhum).
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {APPROACH_NEXT_ACTION_KEYS.map((key) => (
                <label key={key} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={resultForm.allowed_next_actions.includes(key)}
                    disabled={resultForm.require_schedule_return && key === "schedule_return"}
                    onChange={() => toggleAllowedAction(key)}
                  />
                  {APPROACH_NEXT_ACTION_LABELS[key]}
                </label>
              ))}
            </div>
          </div>
          <label style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={resultForm.suggest_follow_up}
              onChange={(e) => setResultForm((f) => ({ ...f, suggest_follow_up: e.target.checked }))}
            />
            Exigir próximo passo (não aceitar Nenhum quando estiver marcado acima)
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => setResultModal(false)}>
              Cancelar
            </button>
            <button className="btn btn-primary" type="submit" disabled={resultSaving}>
              {resultSaving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </CadastroModal>
    </div>
  );
}
