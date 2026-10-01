"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CadastroModal, CadastroPageHeader } from "@/components/cadastro-ui";
import {
  APPROACH_NEXT_ACTION_LABELS,
  RESULT_REGISTRATION_ACTION_KEYS,
  type ApproachNextActionKey
} from "@/lib/approach-next-actions";
import {
  formatRequiredInfoSummary,
  mergeRegistrationRules,
  type EffectiveRegistrationRules
} from "@/lib/classifications/registration-rules";
import { FilterBar, FilterInput, FilterSelect } from "@/components/filter-bar";
import { formatOccurrenceSummary } from "@/lib/call-strategy/occurrence-policy-shared";

type OccurrenceKindOption =
  | "no_answer"
  | "invalid"
  | "wrong_number"
  | "technical_fail"
  | "conversation_success";

type AssociationRow = {
  id: number;
  call_technical_result_type_id: number;
  commercial_result_type_id: number;
  pipeline_stage_id: number | null;
  collect_notes: boolean | null;
  require_schedule_return: boolean | null;
  require_final_registration: boolean | null;
  ask_decision_maker: boolean | null;
  mark_phone_verified: boolean | null;
  allowed_next_actions: unknown | null;
  dial_counts_for_exhaustion: boolean;
  dial_occurrence_kind: string | null;
  dial_occurrence_limit: number | null;
  dial_min_interval_minutes: number | null;
  dial_limit_action: string | null;
  status: string;
  technical_slug: string;
  technical_display_name: string;
  technical_answered: boolean;
  commercial_slug: string;
  commercial_name: string;
  pipeline_stage_name: string | null;
};

type TechnicalOption = { id: number; display_name: string; slug: string; answered?: boolean; status: string };
type CommercialOption = {
  id: number;
  name: string;
  slug: string;
  status: string;
  collect_notes: boolean;
  require_schedule_return: boolean;
  require_final_registration: boolean;
  ask_decision_maker: boolean;
  mark_phone_verified: boolean;
  allowed_next_actions: unknown;
  suggest_follow_up?: boolean;
  requires_meeting?: boolean;
  lead_qualification?: string | null;
};
type StageOption = { id: number; name: string; status: string; kind: string };

type FormState = {
  atendimento: "answered" | "not_answered";
  call_technical_result_type_id: string;
  commercial_mode: "existing" | "new";
  commercial_result_type_id: string;
  new_commercial_name: string;
  new_commercial_slug: string;
  pipeline_stage_id: string;
  customize_rules: boolean;
  collect_notes: boolean | null;
  require_schedule_return: boolean | null;
  require_final_registration: boolean | null;
  ask_decision_maker: boolean | null;
  mark_phone_verified: boolean | null;
  allowed_next_actions: ApproachNextActionKey[];
  dial_counts_for_exhaustion: boolean;
  dial_occurrence_kind: OccurrenceKindOption | "";
  dial_occurrence_limit: string;
  dial_min_interval_minutes: string;
  dial_limit_action: "exhaust_phone" | "flag_review" | "";
  status: "active" | "inactive";
};

const EMPTY_FORM: FormState = {
  atendimento: "not_answered",
  call_technical_result_type_id: "",
  commercial_mode: "existing",
  commercial_result_type_id: "",
  new_commercial_name: "",
  new_commercial_slug: "",
  pipeline_stage_id: "",
  customize_rules: false,
  collect_notes: null,
  require_schedule_return: null,
  require_final_registration: null,
  ask_decision_maker: null,
  mark_phone_verified: null,
  allowed_next_actions: ["none"],
  dial_counts_for_exhaustion: false,
  dial_occurrence_kind: "",
  dial_occurrence_limit: "",
  dial_min_interval_minutes: "",
  dial_limit_action: "exhaust_phone",
  status: "active"
};

function effectiveForRow(row: AssociationRow, commercial?: CommercialOption): EffectiveRegistrationRules | null {
  if (!commercial) return null;
  return mergeRegistrationRules(commercial, {
    collect_notes: row.collect_notes,
    require_schedule_return: row.require_schedule_return,
    require_final_registration: row.require_final_registration,
    ask_decision_maker: row.ask_decision_maker,
    mark_phone_verified: row.mark_phone_verified,
    allowed_next_actions: row.allowed_next_actions
  });
}

export function ResultAssociationMatrixAdmin() {
  const [rows, setRows] = useState<AssociationRow[]>([]);
  const [technical, setTechnical] = useState<TechnicalOption[]>([]);
  const [commercial, setCommercial] = useState<CommercialOption[]>([]);
  const [stages, setStages] = useState<StageOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterAtendimento, setFilterAtendimento] = useState<"all" | "answered" | "not_answered">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("active");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [assocRes, classRes, stageRes] = await Promise.all([
      fetch("/api/result-registration-associations"),
      fetch("/api/approach-classifications"),
      fetch("/api/pipeline-stages")
    ]);
    const assocJson = (await assocRes.json()) as { items?: AssociationRow[] };
    setRows(assocJson.items ?? []);
    const classJson = (await classRes.json()) as {
      technical?: TechnicalOption[];
      commercial?: CommercialOption[];
    };
    setTechnical(classJson.technical ?? []);
    setCommercial(classJson.commercial ?? []);
    if (stageRes.ok) {
      const st = (await stageRes.json()) as { items?: StageOption[] };
      setStages((st.items ?? []).filter((s) => s.status === "active"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const commercialById = useMemo(() => new Map(commercial.map((c) => [c.id, c])), [commercial]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (filterAtendimento === "answered" && !r.technical_answered) return false;
      if (filterAtendimento === "not_answered" && r.technical_answered) return false;
      if (!q) return true;
      return (
        r.technical_display_name.toLowerCase().includes(q) ||
        r.commercial_name.toLowerCase().includes(q) ||
        (r.pipeline_stage_name?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, search, filterAtendimento, filterStatus]);

  const grouped = useMemo(() => {
    const answered = filteredRows.filter((r) => r.technical_answered);
    const notAnswered = filteredRows.filter((r) => !r.technical_answered);
    return { answered, notAnswered };
  }, [filteredRows]);

  const technicalForForm = useMemo(() => {
    const wantAnswered = form.atendimento === "answered";
    return technical.filter((t) => t.status === "active" && Boolean(t.answered) === wantAnswered);
  }, [technical, form.atendimento]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(row: AssociationRow) {
    const allowed = Array.isArray(row.allowed_next_actions)
      ? (row.allowed_next_actions as string[]).filter((k): k is ApproachNextActionKey =>
          RESULT_REGISTRATION_ACTION_KEYS.includes(k as ApproachNextActionKey)
        )
      : [];
    setEditingId(row.id);
    setForm({
      atendimento: row.technical_answered ? "answered" : "not_answered",
      call_technical_result_type_id: String(row.call_technical_result_type_id),
      commercial_mode: "existing",
      commercial_result_type_id: String(row.commercial_result_type_id),
      new_commercial_name: "",
      new_commercial_slug: "",
      pipeline_stage_id: row.pipeline_stage_id ? String(row.pipeline_stage_id) : "",
      customize_rules: row.collect_notes != null || row.require_schedule_return != null || row.allowed_next_actions != null,
      collect_notes: row.collect_notes,
      require_schedule_return: row.require_schedule_return,
      require_final_registration: row.require_final_registration,
      ask_decision_maker: row.ask_decision_maker,
      mark_phone_verified: row.mark_phone_verified,
      allowed_next_actions: allowed.length > 0 ? allowed : (["none"] as ApproachNextActionKey[]),
      dial_counts_for_exhaustion: row.dial_counts_for_exhaustion,
      dial_occurrence_kind: (row.dial_occurrence_kind as OccurrenceKindOption) ?? "",
      dial_occurrence_limit: row.dial_occurrence_limit != null ? String(row.dial_occurrence_limit) : "",
      dial_min_interval_minutes:
        row.dial_min_interval_minutes != null ? String(row.dial_min_interval_minutes) : "",
      dial_limit_action: (row.dial_limit_action as FormState["dial_limit_action"]) || "exhaust_phone",
      status: row.status as "active" | "inactive"
    });
    setError(null);
    setModalOpen(true);
  }

  function onAtendimentoChange(v: "answered" | "not_answered") {
    setForm((f) => {
      const tech = technical.find((t) => String(t.id) === f.call_technical_result_type_id);
      const incompatible = tech && Boolean(tech.answered) !== (v === "answered");
      return {
        ...f,
        atendimento: v,
        call_technical_result_type_id: incompatible ? "" : f.call_technical_result_type_id
      };
    });
  }

  function toggleAction(key: ApproachNextActionKey) {
    setForm((f) => {
      const set = new Set(f.allowed_next_actions);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      let next = RESULT_REGISTRATION_ACTION_KEYS.filter((k) => set.has(k));
      if (next.length === 0) next = ["none"];
      return { ...f, allowed_next_actions: next };
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    let commercialId = form.commercial_result_type_id ? Number(form.commercial_result_type_id) : 0;
    if (form.commercial_mode === "new") {
      if (!form.new_commercial_name.trim() || !form.new_commercial_slug.trim()) {
        setError("Informe nome e identificador do novo resultado comercial.");
        setSaving(false);
        return;
      }
      const createRes = await fetch("/api/approach-result-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.new_commercial_name.trim(),
          slug: form.new_commercial_slug.trim(),
          status: "active",
          collect_notes: false,
          require_schedule_return: false,
          require_final_registration: true,
          allowed_next_actions: ["none"]
        })
      });
      if (!createRes.ok) {
        setError("Não foi possível criar o resultado comercial.");
        setSaving(false);
        return;
      }
      const created = (await createRes.json()) as { id?: number };
      commercialId = Number(created.id);
    }

    if (!form.call_technical_result_type_id || !commercialId) {
      setError("Selecione resultado da ligação e comercial.");
      setSaving(false);
      return;
    }

    const payload = {
      call_technical_result_type_id: Number(form.call_technical_result_type_id),
      commercial_result_type_id: commercialId,
      pipeline_stage_id: form.pipeline_stage_id ? Number(form.pipeline_stage_id) : null,
      atendimento_answered: form.atendimento === "answered",
      collect_notes: form.customize_rules ? form.collect_notes : null,
      require_schedule_return: form.customize_rules ? form.require_schedule_return : null,
      require_final_registration: form.customize_rules ? form.require_final_registration : null,
      ask_decision_maker: form.customize_rules ? form.ask_decision_maker : null,
      mark_phone_verified: form.customize_rules ? form.mark_phone_verified : null,
      allowed_next_actions: form.customize_rules ? form.allowed_next_actions : null,
      dial_counts_for_exhaustion: form.dial_counts_for_exhaustion,
      dial_occurrence_kind: form.dial_occurrence_kind || null,
      dial_occurrence_limit: form.dial_occurrence_limit ? Number(form.dial_occurrence_limit) : null,
      dial_min_interval_minutes: form.dial_min_interval_minutes
        ? Number(form.dial_min_interval_minutes)
        : null,
      dial_limit_action: form.dial_counts_for_exhaustion ? form.dial_limit_action || "exhaust_phone" : null,
      status: form.status
    };

    const url = editingId ? `/api/result-registration-associations/${editingId}` : "/api/result-registration-associations";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSaving(false);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Erro ao salvar");
      return;
    }
    setModalOpen(false);
    void load();
  }

  function renderDataRow(row: AssociationRow) {
    const comm = commercialById.get(row.commercial_result_type_id);
    const eff = effectiveForRow(row, comm);
    return (
      <tr key={row.id} className={row.status === "inactive" ? "result-assoc-row--inactive" : undefined}>
        <td>{row.technical_display_name}</td>
        <td>{row.commercial_name}</td>
        <td>{row.pipeline_stage_name ?? <span className="muted">Manter etapa atual</span>}</td>
        <td className="result-assoc-info-cell">
          {eff ? (
            <span className="result-assoc-info-summary" title={formatRequiredInfoSummary(eff)}>
              {formatRequiredInfoSummary(eff)}
            </span>
          ) : (
            "—"
          )}
        </td>
        <td className="muted" style={{ fontSize: "0.8125rem", maxWidth: 200 }}>
          {formatOccurrenceSummary(row)}
        </td>
        <td>
          <span className={clsx("result-assoc-status", row.status === "active" && "result-assoc-status--active")}>
            {row.status === "active" ? "Ativo" : "Inativo"}
          </span>
        </td>
        <td>
          <div className="cadastro-list-actions">
            <button type="button" className="btn" onClick={() => openEdit(row)}>
              Editar
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="result-assoc-matrix">
      {error && !modalOpen ? <div className="alert alert-error">{error}</div> : null}

      <CadastroPageHeader title="Matriz de fluxo operacional" onNew={openCreate} newLabel="Nova associação" />
      <p className="muted page-intro" style={{ marginTop: 0 }}>
        Cada linha liga um <strong>resultado da ligação</strong> a um <strong>resultado comercial</strong>, com regras de
        finalização e etapa do funil. Um mesmo resultado comercial pode aparecer em várias linhas.
      </p>

      <FilterBar>
        <FilterInput
          label="Busca"
          className="filter-chip-grow"
          placeholder="Resultado da ligação, comercial, etapa…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <FilterSelect
          label="Atendimento"
          value={filterAtendimento}
          onChange={(e) => setFilterAtendimento(e.target.value as typeof filterAtendimento)}
        >
          <option value="all">Todos</option>
          <option value="answered">Atendeu</option>
          <option value="not_answered">Não atendeu</option>
        </FilterSelect>
        <FilterSelect
          label="Status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
        >
          <option value="active">Somente ativas</option>
          <option value="inactive">Somente inativas</option>
          <option value="all">Todas</option>
        </FilterSelect>
      </FilterBar>

      <div className="panel table-wrap">
        <table className="data-table result-assoc-table">
          <thead>
            <tr>
              <th>Resultado da ligação</th>
              <th>Resultado comercial</th>
              <th>Etapa de destino do funil</th>
              <th>Informações exigidas</th>
              <th>Tentativas e esgotamento</th>
              <th>Status</th>
              <th style={{ width: 140 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {grouped.answered.length > 0 ? (
              <>
                <tr className="result-assoc-group-row result-assoc-group-row--yes">
                  <td colSpan={7}>Atendeu</td>
                </tr>
                {grouped.answered.map(renderDataRow)}
              </>
            ) : null}
            {grouped.notAnswered.length > 0 ? (
              <>
                <tr className="result-assoc-group-row result-assoc-group-row--no">
                  <td colSpan={7}>Não atendeu</td>
                </tr>
                {grouped.notAnswered.map(renderDataRow)}
              </>
            ) : null}
            {grouped.answered.length === 0 && grouped.notAnswered.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  Nenhuma associação encontrada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <CadastroModal
        open={modalOpen}
        title={editingId ? "Editar associação" : "Nova associação"}
        onClose={() => setModalOpen(false)}
        wide
      >
        <form onSubmit={save}>
          {error ? <div className="alert alert-error">{error}</div> : null}

          <div className="field">
            <label className="label">Atendimento *</label>
            <div className="contact-verification-picker" role="radiogroup">
              {(
                [
                  ["answered", "Atendeu"],
                  ["not_answered", "Não atendeu"]
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  role="radio"
                  aria-checked={form.atendimento === val}
                  className={clsx("contact-verification-option", form.atendimento === val && "contact-verification-option--active")}
                  onClick={() => onAtendimentoChange(val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="label">Resultado da ligação *</label>
            <select
              className="select"
              required
              value={form.call_technical_result_type_id}
              onChange={(e) => setForm((f) => ({ ...f, call_technical_result_type_id: e.target.value }))}
            >
              <option value="">Selecione…</option>
              {technicalForForm.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.display_name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="label">Resultado comercial *</label>
            <select
              className="select"
              value={form.commercial_mode}
              onChange={(e) =>
                setForm((f) => ({ ...f, commercial_mode: e.target.value as "existing" | "new", commercial_result_type_id: "" }))
              }
            >
              <option value="existing">Selecionar existente</option>
              <option value="new">Criar novo</option>
            </select>
          </div>

          {form.commercial_mode === "existing" ? (
            <div className="field">
              <select
                className="select"
                required={form.commercial_mode === "existing"}
                value={form.commercial_result_type_id}
                onChange={(e) => setForm((f) => ({ ...f, commercial_result_type_id: e.target.value }))}
              >
                <option value="">Selecione…</option>
                {commercial.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div className="field">
                <label className="label">Nome do novo resultado</label>
                <input
                  className="input"
                  value={form.new_commercial_name}
                  onChange={(e) => setForm((f) => ({ ...f, new_commercial_name: e.target.value }))}
                />
              </div>
              <div className="field">
                <label className="label">Identificador (slug)</label>
                <input
                  className="input"
                  value={form.new_commercial_slug}
                  onChange={(e) => setForm((f) => ({ ...f, new_commercial_slug: e.target.value }))}
                />
              </div>
            </>
          )}

          <div className="field">
            <label className="label">Etapa de destino do funil</label>
            <select
              className="select"
              value={form.pipeline_stage_id}
              onChange={(e) => setForm((f) => ({ ...f, pipeline_stage_id: e.target.value }))}
            >
              <option value="">Manter etapa atual</option>
              {stages.filter((s) => s.kind === "in_progress").map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.customize_rules}
                onChange={(e) => setForm((f) => ({ ...f, customize_rules: e.target.checked }))}
              />
              Personalizar informações exigidas nesta associação
            </label>
            <p className="muted" style={{ fontSize: "0.8125rem", margin: "0.35rem 0 0" }}>
              Se desmarcado, valem as regras cadastradas no resultado comercial.
            </p>
          </div>

          {form.customize_rules ? (
            <div className="result-assoc-rules-panel">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.collect_notes === true}
                  onChange={(e) => setForm((f) => ({ ...f, collect_notes: e.target.checked }))}
                />
                Exigir observação
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.require_schedule_return === true}
                  onChange={(e) => setForm((f) => ({ ...f, require_schedule_return: e.target.checked }))}
                />
                Exigir retorno agendado
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.ask_decision_maker === true}
                  onChange={(e) => setForm((f) => ({ ...f, ask_decision_maker: e.target.checked }))}
                />
                Perguntar pessoa contatada / decisor
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.require_final_registration === false}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, require_final_registration: e.target.checked ? false : true }))
                  }
                />
                Registro simplificado (sem complemento obrigatório)
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.mark_phone_verified === true}
                  onChange={(e) => setForm((f) => ({ ...f, mark_phone_verified: e.target.checked }))}
                />
                Marcar telefone verificado
              </label>
              <div className="field">
                <span className="label">Próximo passo permitido</span>
                <div className="result-assoc-actions-grid">
                  {RESULT_REGISTRATION_ACTION_KEYS.map((key) => (
                    <label key={key} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.allowed_next_actions.includes(key)}
                        onChange={() => toggleAction(key)}
                      />
                      {APPROACH_NEXT_ACTION_LABELS[key]}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="result-assoc-rules-panel" style={{ marginTop: 16 }}>
            <h4 style={{ marginTop: 0 }}>Tentativas e esgotamento</h4>
            <p className="muted" style={{ fontSize: "0.8125rem" }}>
              Define como esta combinação ligação × comercial alimenta os contadores por telefone. O registro comercial da
              BDR prevalece sobre o código técnico do discador.
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.dial_counts_for_exhaustion}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    dial_counts_for_exhaustion: e.target.checked,
                    dial_occurrence_kind: e.target.checked && !f.dial_occurrence_kind ? "no_answer" : f.dial_occurrence_kind
                  }))
                }
              />
              Conta para esgotamento do telefone
            </label>
            {form.dial_counts_for_exhaustion ? (
              <>
                <div className="field">
                  <label className="label">Tipo de ocorrência / contador</label>
                  <select
                    className="select"
                    value={form.dial_occurrence_kind}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        dial_occurrence_kind: e.target.value as OccurrenceKindOption
                      }))
                    }
                  >
                    <option value="">Selecione…</option>
                    <option value="no_answer">Não atendeu / ocupado</option>
                    <option value="invalid">Número inválido</option>
                    <option value="wrong_number">Número errado (conversa)</option>
                  </select>
                </div>
                <div className="field">
                  <label className="label">Limite de ocorrências</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={50}
                    placeholder="Padrão global (ex.: 3)"
                    value={form.dial_occurrence_limit}
                    onChange={(e) => setForm((f) => ({ ...f, dial_occurrence_limit: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label className="label">Intervalo mínimo (minutos)</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    placeholder="Padrão global (ex.: 60)"
                    value={form.dial_min_interval_minutes}
                    onChange={(e) => setForm((f) => ({ ...f, dial_min_interval_minutes: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label className="label">Ao atingir o limite</label>
                  <select
                    className="select"
                    value={form.dial_limit_action}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        dial_limit_action: e.target.value as FormState["dial_limit_action"]
                      }))
                    }
                  >
                    <option value="exhaust_phone">Esgotar telefone</option>
                    <option value="flag_review">Sinalizar para revisão</option>
                  </select>
                </div>
              </>
            ) : (
              <div className="field">
                <label className="label">Classificação (sem contagem)</label>
                <select
                  className="select"
                  value={form.dial_occurrence_kind || "conversation_success"}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      dial_occurrence_kind: e.target.value as OccurrenceKindOption
                    }))
                  }
                >
                  <option value="conversation_success">Conversa válida</option>
                  <option value="technical_fail">Falha técnica</option>
                </select>
              </div>
            )}
          </div>

          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setModalOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </CadastroModal>
    </div>
  );
}
