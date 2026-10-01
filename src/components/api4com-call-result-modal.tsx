"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CadastroModal } from "@/components/cadastro-ui";
import { LEAD_QUALIFICATION_LABELS, type LeadQualification } from "@/lib/lead-qualification";
import { formatSpDateTime } from "@/lib/datetime";
import type { Product } from "@/lib/types";
import { formatPhoneDisplay } from "@/lib/format";
import {
  applyThreeLayerSuggestions,
  CallThreeLayerRegistrationFields,
  resolveCallTechnicalSlug,
  type CommercialOption,
  type ContactOutcomeOption
} from "@/components/call-three-layer-registration-fields";
import type { OperationalAction } from "@/lib/attendance/operational-actions";
import {
  filterCommercialByContactCompat,
  listAnsweredCommercialOptions,
  resolveAllowedCommercialIds,
  resolveEffectiveBdrRules
} from "@/lib/attendance/bdr-registration";
import { CallDialContextBanner } from "@/components/call-dial-context-banner";
import type { TechnicalResultTypeRow } from "@/lib/classifications/technical-result-match";
import { formatCallScriptLogForNotes, normalizeCallScriptLog } from "@/lib/call-script-log";
import { ApproachNextStepField } from "@/components/approach-next-step-field";
import {
  type ApproachNextActionKey,
  validateNextActionChoice
} from "@/lib/approach-next-actions";
import { ApproachDecisionMakerField } from "@/components/approach-decision-maker-field";
import { confirmProceedIfClientHasAgenda } from "@/lib/client-agenda-warning";

type CallDetail = {
  id: number;
  api4com_call_id: string | null;
  client_id: number | null;
  contact_id: number | null;
  product_id: number | null;
  phone_dialed: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  hangup_cause_code: string | null;
  hangup_cause_label: string | null;
  answered_at: string | null;
  technical_display_name?: string | null;
  technical_slug?: string | null;
  technical_provider_code?: string | null;
  technical_provider_label?: string | null;
  client_name: string | null;
  contact_name: string | null;
  record_url: string | null;
  script_flow_log?: unknown;
};

type ResultType = {
  id: number;
  slug: string;
  name: string;
  suggest_follow_up: boolean;
  lead_qualification: LeadQualification | null;
  collect_notes: boolean;
  require_schedule_return: boolean;
  require_final_registration: boolean;
  ask_decision_maker?: boolean;
  mark_phone_verified?: boolean;
  allowed_next_actions?: unknown;
  requires_meeting?: boolean;
};

type AttendanceRuleLite = {
  id: number;
  answered: boolean;
  name: string;
  operational_action: OperationalAction;
  commercial_result_type_id: number | null;
};

type ClosureReason = { id: number; name: string; kind: "pause" | "close" };

type StrategyPhone = {
  client_phone_id: number;
  phone: string;
  phone_display: string;
  origin: string;
  position: number;
  total: number;
  status: string;
  attempt_label: string;
  next_eligible_at: string | null;
  last_attempt_at: string | null;
  last_bucket: string | null;
  eligible_now: boolean;
  primary_contact_id: number | null;
  counter_line: string | null;
  counter_lines: string[];
  needs_review: boolean;
};

type DialOption = {
  contact_id: number;
  contact_name: string | null;
  phone: string;
  phone_display: string;
  kind: "phone" | "whatsapp";
  strategy?: StrategyPhone;
};

type DialContext = {
  call: CallDetail;
  session_root_id: number;
  remaining: DialOption[];
  skipped: Array<{ contact_id: number | null; phone: string; created_at: string }>;
  session_calls: Array<{
    id: number;
    contact_id: number | null;
    phone_dialed: string;
    ended_at: string | null;
    duration_seconds: number | null;
  }>;
  client_product_ids: number[];
  call_strategy?: {
    phones: StrategyPhone[];
    suggested: StrategyPhone | null;
    waiting_next_at: string | null;
    lead_status: string;
    phone_summary: string;
  } | null;
  current_phone?: StrategyPhone | null;
};

function spInputToIso(date: string, time: string) {
  return new Date(`${date}T${time}:00-03:00`).toISOString();
}

type ResultFormProps = {
  callId: number | null;
  active: boolean;
  layout: "modal" | "panel";
  onClose: () => void;
  onCompleted: () => void;
  products: Product[];
  onModalTitleChange?: (title: string) => void;
};

export function Api4comCallResultForm({
  callId,
  active,
  layout,
  onClose,
  onCompleted,
  products,
  onModalTitleChange
}: ResultFormProps) {
  const [ctx, setCtx] = useState<DialContext | null>(null);
  const [step, setStep] = useState<"next_dial" | "result">("result");
  const [resultTypes, setResultTypes] = useState<ResultType[]>([]);
  const [resultTypeId, setResultTypeId] = useState("");
  const [productId, setProductId] = useState("");
  const [notes, setNotes] = useState("");
  const [contextLoading, setContextLoading] = useState(false);
  const [nextType, setNextType] = useState<ApproachNextActionKey>("none");
  const [reasonId, setReasonId] = useState("");
  const [closureReasons, setClosureReasons] = useState<ClosureReason[]>([]);
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [dialLoading, setDialLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultLockedByIntegration, setResultLockedByIntegration] = useState(false);
  const [contactLocked, setContactLocked] = useState(false);
  const [spokeWithDecisionMaker, setSpokeWithDecisionMaker] = useState<boolean | null>(null);
  const [, setTechnicalTypes] = useState<TechnicalResultTypeRow[]>([]);
  const [contactTypes, setContactTypes] = useState<ContactOutcomeOption[]>([]);
  const [compatMap, setCompatMap] = useState<Record<string, number[]>>({});
  const [attendanceRules, setAttendanceRules] = useState<AttendanceRuleLite[]>([]);
  const [maxNoContact, setMaxNoContact] = useState(3);
  const [contactOutcomeId, setContactOutcomeId] = useState("");
  const [, setTechnicalSlug] = useState<string | null>(null);
  const [technicalLabel, setTechnicalLabel] = useState("");
  const [contactedPersonName, setContactedPersonName] = useState("");
  const [contactedPersonJobTitle, setContactedPersonJobTitle] = useState("");
  const [contactedPersonNotes, setContactedPersonNotes] = useState("");

  const call = ctx?.call ?? null;

  function applyCallContext(
    ctxData: DialContext,
    activeResults: ResultType[],
    techTypes: TechnicalResultTypeRow[],
    contacts: ContactOutcomeOption[],
    commercial: CommercialOption[]
  ) {
    setCtx(ctxData);
    const autoProductId =
      ctxData.call.product_id ??
      (ctxData.client_product_ids.length > 0 ? ctxData.client_product_ids[0] : null);
    setProductId(autoProductId != null ? String(autoProductId) : "");

    const slug = resolveCallTechnicalSlug(techTypes, {
      technical_slug: ctxData.call.technical_slug,
      hangup_cause_code: ctxData.call.hangup_cause_code ?? null,
      hangup_cause_label: ctxData.call.hangup_cause_label ?? null,
      duration_seconds: ctxData.call.duration_seconds,
      answered_at: ctxData.call.answered_at ?? null
    });
    setTechnicalSlug(slug);
    const techRow =
      techTypes.find((t) => t.slug === slug) ??
      (ctxData.call.technical_display_name
        ? { display_name: ctxData.call.technical_display_name, slug: slug ?? "" }
        : null);
    setTechnicalLabel(
      ctxData.call.technical_display_name ??
        (techRow && "display_name" in techRow ? techRow.display_name : "") ??
        "Aguardando telefonia"
    );

    const suggestions = applyThreeLayerSuggestions({
      technicalSlug: slug,
      contactTypes: contacts,
      commercialTypes: commercial
    });
    setContactOutcomeId(suggestions.contactId);
    setResultTypeId(suggestions.commercialId);
    setContactLocked(suggestions.lockContact);
    setResultLockedByIntegration(suggestions.lockCommercial);

    setStep("result");
  }

  const loadContext = useCallback(async () => {
    if (!callId) return;
    setError(null);
    setContextLoading(true);
    try {
      const [ctxRes, classRes, basicRes, crRes, attRes] = await Promise.all([
        fetch(`/api/api4com/calls/${callId}/dial-context`),
        fetch("/api/approach-classifications"),
        fetch(`/api/api4com/calls/${callId}`),
        fetch("/api/closure-reason-types"),
        fetch("/api/attendance-rules")
      ]);
      if (attRes.ok) {
        const att = (await attRes.json()) as {
          items?: AttendanceRuleLite[];
          max_no_contact_attempts?: number;
        };
        setAttendanceRules(att.items ?? []);
        if (att.max_no_contact_attempts) setMaxNoContact(att.max_no_contact_attempts);
      } else {
        setAttendanceRules([]);
      }
      if (crRes.ok) {
        const cr = (await crRes.json()) as { items?: ClosureReason[] };
        setClosureReasons(cr.items ?? []);
      }

      const classJson = (await classRes.json()) as {
        technical?: TechnicalResultTypeRow[];
        contact?: ContactOutcomeOption[];
        commercial?: CommercialOption[];
        contact_commercial_compat?: Record<string, number[]>;
        error?: string;
      };
      const techTypes = classRes.ok ? (classJson.technical ?? []) : [];
      const contacts = classRes.ok ? (classJson.contact ?? []) : [];
      const commercialRaw = classRes.ok ? (classJson.commercial ?? []) : [];
      type CommercialFromApi = CommercialOption & {
        suggest_follow_up?: boolean;
        lead_qualification?: string | null;
        require_final_registration?: boolean;
        ask_decision_maker?: boolean;
        allowed_next_actions?: unknown;
      };
      const activeResults: ResultType[] = (commercialRaw as CommercialFromApi[]).map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        suggest_follow_up: Boolean(c.suggest_follow_up),
        lead_qualification:
          c.lead_qualification === "warm" || c.lead_qualification === "hot" || c.lead_qualification === "cold"
            ? c.lead_qualification
            : null,
        collect_notes: c.collect_notes !== false,
        require_schedule_return: c.require_schedule_return === true,
        require_final_registration: c.require_final_registration !== false,
        ask_decision_maker: c.ask_decision_maker === true,
        mark_phone_verified: (c as { mark_phone_verified?: boolean }).mark_phone_verified === true,
        allowed_next_actions: c.allowed_next_actions
      }));
      if (!classRes.ok) {
        setError(classJson.error ?? "Não foi possível carregar classificações.");
      }
      setTechnicalTypes(techTypes);
      setContactTypes(contacts);
      setCompatMap(classJson.contact_commercial_compat ?? {});
      setResultTypes(activeResults);

      const ctxJson = (await ctxRes.json()) as DialContext & { error?: string };
      let ctxData: DialContext | null = ctxRes.ok && ctxJson.call ? ctxJson : null;

      if (!ctxData && basicRes.ok) {
        const basic = (await basicRes.json()) as { call?: CallDetail };
        if (basic.call) {
          ctxData = {
            call: basic.call,
            session_root_id: basic.call.id,
            remaining: [],
            skipped: [],
            session_calls: [],
            client_product_ids: []
          };
        }
      }

      if (!ctxData?.call) {
        setError(ctxJson.error ?? "Chamada não encontrada");
        setCtx(null);
        setStep("result");
        return;
      }

      if (ctxData.client_product_ids.length === 0 && ctxData.call.client_id) {
        const cpRes = await fetch(`/api/clients/${ctxData.call.client_id}`);
        if (cpRes.ok) {
          const cp = (await cpRes.json()) as { products?: Array<{ product_id: number }> };
          ctxData = {
            ...ctxData,
            client_product_ids: cp.products?.map((p) => p.product_id) ?? []
          };
        }
      }

      applyCallContext(ctxData, activeResults, techTypes, contacts, commercialRaw);
    } finally {
      setContextLoading(false);
    }
  }, [callId]);

  useEffect(() => {
    if (!active || !callId) return;
    setCtx(null);
    setResultTypes([]);
    setResultTypeId("");
    setResultLockedByIntegration(false);
    setContactLocked(false);
    setContactOutcomeId("");
    setTechnicalSlug(null);
    setTechnicalLabel("");
    setNotes("");
    setNextType("none");
    setReasonId("");
    setNextDate("");
    setNextTime("");
    setStep("result");
    void loadContext();
  }, [active, callId, loadContext]);

  const modalTitle =
    step === "next_dial" ? "Ligar para outro contato?" : "COMPLEMENTO DE REGISTRO";

  useEffect(() => {
    if (layout === "modal") onModalTitleChange?.(modalTitle);
  }, [layout, modalTitle, onModalTitleChange]);

  const selectedResultBase = resultTypes.find((r) => String(r.id) === resultTypeId);
  const selectedContact = contactTypes.find((c) => String(c.id) === contactOutcomeId);
  const compatIds = contactOutcomeId ? compatMap[contactOutcomeId] ?? null : null;

  const allowedCommercialIds = useMemo(
    () =>
      resolveAllowedCommercialIds(
        attendanceRules,
        resultTypes.map((r) => ({ id: r.id, slug: r.slug, name: r.name })),
        contactOutcomeId || null,
        compatMap
      ),
    [attendanceRules, resultTypes, contactOutcomeId, compatMap]
  );

  const callWasAnswered = useMemo(() => {
    if (call?.answered_at) return true;
    const slug = call?.technical_slug;
    if (slug === "answered") return true;
    if (slug === "no_answer" || slug === "busy" || slug === "invalid_number" || slug === "call_failed") {
      return false;
    }
    return (call?.duration_seconds ?? 0) > 0;
  }, [call?.answered_at, call?.technical_slug, call?.duration_seconds]);

  const bdrResultTypes = useMemo(() => {
    const base = listAnsweredCommercialOptions(
      attendanceRules,
      resultTypes.map((r) => ({ id: r.id, slug: r.slug, name: r.name }))
    );
    if (attendanceRules.length === 0) return resultTypes;
    return resultTypes.filter((r) => base.some((b) => b.id === r.id));
  }, [resultTypes, attendanceRules]);

  const commercialOptionsForContact = useMemo(
    () =>
      filterCommercialByContactCompat(
        bdrResultTypes.map((r) => ({ id: r.id, slug: r.slug, name: r.name })),
        contactOutcomeId,
        compatMap
      ),
    [bdrResultTypes, contactOutcomeId, compatMap]
  );

  const selectedResult = useMemo(() => {
    if (!selectedResultBase) return undefined;
    const effective = resolveEffectiveBdrRules(selectedResultBase, attendanceRules);
    return {
      ...selectedResultBase,
      collect_notes: effective.collect_notes,
      require_schedule_return: effective.require_schedule_return,
      require_final_registration: effective.require_final_registration,
      ask_decision_maker: effective.ask_decision_maker,
      mark_phone_verified: effective.mark_phone_verified,
      requires_meeting: effective.requires_meeting,
      allowed_next_actions: effective.allowed_next_actions
    };
  }, [selectedResultBase, attendanceRules]);

  useEffect(() => {
    if (!contactOutcomeId || resultLockedByIntegration) return;
    const contact = contactTypes.find((c) => String(c.id) === contactOutcomeId);
    if (contact?.slug === "nenhum_contato") {
      const sem = resultTypes.find((r) => r.slug === "sem_contato");
      if (sem) setResultTypeId(String(sem.id));
    }
  }, [contactOutcomeId, contactTypes, resultTypes, resultLockedByIntegration]);
  const effectiveProductId = useMemo(() => {
    if (call?.product_id != null) return call.product_id;
    const ids = ctx?.client_product_ids ?? [];
    if (ids.length > 0) return ids[0];
    if (productId) return Number(productId);
    return null;
  }, [call?.product_id, ctx?.client_product_ids, productId]);

  const productDisplayName = useMemo(() => {
    if (effectiveProductId == null) return null;
    return products.find((p) => p.id === effectiveProductId)?.name ?? null;
  }, [effectiveProductId, products]);

  const showNotesField = selectedResult?.collect_notes === true;
  const showRegistrationSteps = selectedResult?.require_final_registration !== false;
  const showDecisionMakerField = selectedResult?.ask_decision_maker === true;

  useEffect(() => {
    setSpokeWithDecisionMaker(null);
  }, [resultTypeId]);
  const nextDial = useMemo(() => {
    const s = ctx?.call_strategy?.suggested;
    if (s) {
      return {
        contact_id: s.primary_contact_id ?? ctx?.call?.contact_id ?? 0,
        contact_name: null as string | null,
        phone: s.phone,
        phone_display: s.phone_display,
        kind: "phone" as const,
        strategy: s
      };
    }
    return ctx?.remaining[0] ?? null;
  }, [ctx]);

  const currentPhone = ctx?.current_phone ?? null;

  async function dismissPending() {
    if (!callId) return;
    if (
      !window.confirm(
        "Dispensar este registro pendente? A ligação permanece no histórico, mas deixa de exigir resultado comercial."
      )
    ) {
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/api4com/calls/${callId}/dismiss`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Não foi possível dispensar");
      return;
    }
    onClose();
    onCompleted();
  }

  async function skipNextDial() {
    if (!callId || !nextDial || !call?.client_id) return;
    setDialLoading(true);
    setError(null);
    const res = await fetch(`/api/api4com/calls/${callId}/dial-skip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: nextDial.contact_id, phone: nextDial.phone })
    });
    setDialLoading(false);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Erro ao registrar");
      return;
    }
    await loadContext();
  }

  async function dialNext() {
    if (!callId || !nextDial || !call?.client_id || !ctx) return;
    setDialLoading(true);
    setError(null);
    const res = await fetch("/api/api4com/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: call.client_id,
        contact_id: nextDial.contact_id,
        product_id: productId ? Number(productId) : call.product_id,
        phone: nextDial.phone,
        dial_session_root_id: ctx.session_root_id
      })
    });
    setDialLoading(false);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Erro ao discar");
      return;
    }
    onClose();
    onCompleted();
  }

  function buildSessionNotes() {
    if (!ctx) return notes.trim();
    const lines: string[] = [];
    if (ctx.skipped.length > 0) {
      lines.push(
        "Números pulados nesta sessão:",
        ...ctx.skipped.map((s) => `· ${formatPhoneDisplay(s.phone)} (pulado)`)
      );
    }
    if (ctx.session_calls.length > 1) {
      lines.push(
        "Ligações nesta sessão:",
        ...ctx.session_calls.map(
          (c) =>
            `· ${formatPhoneDisplay(c.phone_dialed)}${
              c.duration_seconds != null ? ` (${Math.floor(c.duration_seconds / 60)}:${String(c.duration_seconds % 60).padStart(2, "0")})` : ""
            }`
        )
      );
    }
    const scriptNotes = call?.script_flow_log
      ? formatCallScriptLogForNotes(normalizeCallScriptLog(call.script_flow_log))
      : null;
    if (scriptNotes) lines.unshift(scriptNotes);
    const base = showNotesField ? notes.trim() : "";
    if (lines.length === 0) return base;
    return [base, lines.join("\n\n")].filter(Boolean).join("\n\n");
  }

  async function saveRegistration(registrationStatus: "draft" | "final") {
    if (!call || !call.client_id || !resultTypeId) {
      setError("Selecione o resultado comercial.");
      return;
    }
    if (!contactOutcomeId) {
      setError("Selecione o contato realizado.");
      return;
    }
    if (registrationStatus === "final") {
      if (selectedContact?.requires_conversation && !contactedPersonName.trim()) {
        setError("Informe o nome da pessoa contatada.");
        return;
      }
      if (selectedResult?.collect_notes === true && !notes.trim()) {
        setError("Informe as observações exigidas para este resultado.");
        return;
      }
      if (selectedResult?.ask_decision_maker && spokeWithDecisionMaker === null) {
        setError("Informe se houve contato com o decisor.");
        return;
      }
      if (selectedResult && showRegistrationSteps) {
        const nextErr = validateNextActionChoice(selectedResult, nextType);
        if (nextErr) {
          setError(nextErr);
          return;
        }
        if (selectedResult.requires_meeting && nextType !== "schedule_meeting") {
          setError("Este resultado exige reunião agendada.");
          return;
        }
      }
    }
    setLoading(true);
    setError(null);

    const finalNotes = buildSessionNotes();

    const resolvedProductId = effectiveProductId ?? call.product_id;

    let next_action: Record<string, unknown> = { type: "none" };
    if (nextType === "schedule_return" || nextType === "schedule_meeting") {
      if (!nextDate || !nextTime) {
        setError("Informe data e hora.");
        setLoading(false);
        return;
      }
      const proceed = await confirmProceedIfClientHasAgenda(call.client_id);
      if (!proceed) {
        setLoading(false);
        return;
      }
      next_action = {
        type: nextType,
        scheduled_at: spInputToIso(nextDate, nextTime),
        contact_id: call.contact_id,
        product_id: resolvedProductId,
        notes: null
      };
    } else if (nextType === "pause" || nextType === "close") {
      if (!resolvedProductId || !reasonId) {
        setError("Informe produto e motivo para pausar ou encerrar.");
        setLoading(false);
        return;
      }
      next_action = {
        type: nextType,
        product_id: resolvedProductId,
        reason_id: Number(reasonId)
      };
    }

    const res = await fetch("/api/approaches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: call.client_id,
        contact_id: call.contact_id,
        product_id: resolvedProductId,
        channel: "call",
        occurred_at: call.ended_at ?? call.started_at,
        result_type_id: Number(resultTypeId),
        contact_outcome_type_id: Number(contactOutcomeId),
        api4com_call_row_id: call.id,
        contacted_person_name: contactedPersonName.trim() || null,
        contacted_person_job_title: contactedPersonJobTitle.trim() || null,
        contacted_person_notes: contactedPersonNotes.trim() || null,
        registration_status: registrationStatus,
        notes: finalNotes || null,
        external_call_id: call.api4com_call_id,
        spoke_with_decision_maker: showDecisionMakerField ? spokeWithDecisionMaker : null,
        next_action
      })
    });
    const data = (await res.json()) as { id?: number; error?: string };
    if (!res.ok) {
      setLoading(false);
      setError(data.error ?? "Erro ao registrar abordagem");
      return;
    }

    if (data.id) {
      await fetch(`/api/api4com/calls/${call.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approach_id: data.id })
      });
    }

    setLoading(false);
    if (registrationStatus === "draft") {
      onClose();
      return;
    }
    const noContactResult = selectedResult?.slug === "sem_contato";
    if (noContactResult && call.client_id) {
      const ctxRes = await fetch(`/api/api4com/calls/${call.id}/dial-context`);
      if (ctxRes.ok) {
        const fresh = (await ctxRes.json()) as DialContext;
        if (fresh.call) {
          setCtx(fresh);
          if (fresh.call_strategy?.suggested) {
            setStep("next_dial");
            return;
          }
        }
      }
    }
    onClose();
    onCompleted();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await saveRegistration("final");
  }

  async function submitDraft() {
    await saveRegistration("draft");
  }

  const duration =
    call?.duration_seconds != null
      ? `${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, "0")}`
      : "—";

  if (!active || !callId) return null;

  const inner = (
    <>
      {call ? (
        <div className="muted" style={{ fontSize: "0.8125rem", marginBottom: 12 }}>
          <p style={{ margin: "0 0 4px" }}>
            <strong>{call.client_name ?? "Cliente"}</strong>
            {call.contact_name ? ` · ${call.contact_name}` : null}
          </p>
          <p style={{ margin: 0 }}>
            {formatPhoneDisplay(call.phone_dialed)} · {call.ended_at ? formatSpDateTime(call.ended_at) : "—"} · duração {duration}
            {call.hangup_cause_label ? ` · ${call.hangup_cause_label}` : null}
          </p>
          {call.record_url ? (
            <p style={{ margin: "6px 0 0" }}>
              <a href={`/api/api4com/calls/${call.id}/recording`} target="_blank" rel="noreferrer">
                Ouvir gravação
              </a>
            </p>
          ) : null}
          {currentPhone ? (
            <div className="panel" style={{ padding: 10, marginTop: 10, fontSize: "0.8125rem" }}>
              <div>
                <strong>Telefone {currentPhone.position} de {currentPhone.total}</strong> · Origem: {currentPhone.origin}
              </div>
              <div>{currentPhone.counter_line ?? currentPhone.attempt_label}</div>
              {currentPhone.counter_lines && currentPhone.counter_lines.length > 1 ? (
                <div className="muted" style={{ fontSize: "0.75rem" }}>
                  {currentPhone.counter_lines.join(" · ")}
                </div>
              ) : null}
              {currentPhone.needs_review ? (
                <div className="muted" style={{ fontSize: "0.75rem" }}>
                  Sinalizado para revisão
                </div>
              ) : null}
              <div className="muted">
                Estado:{" "}
                {currentPhone.status === "waiting"
                  ? "Aguardando próxima tentativa"
                  : currentPhone.status === "exhausted"
                    ? "Esgotado"
                    : "Disponível"}
                {currentPhone.next_eligible_at ? ` · Próxima: ${formatSpDateTime(currentPhone.next_eligible_at)}` : ""}
              </div>
              {currentPhone.last_attempt_at ? (
                <div className="muted">
                  Última tentativa: {formatSpDateTime(currentPhone.last_attempt_at)}
                  {currentPhone.last_bucket ? ` (${currentPhone.last_bucket})` : ""}
                </div>
              ) : null}
              {ctx?.call_strategy?.phones && ctx.call_strategy.phones.length > 1 ? (
                <details style={{ marginTop: 6 }}>
                  <summary>Outros números do lead</summary>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {ctx.call_strategy.phones.map((p) => (
                      <li key={p.client_phone_id} className={p.eligible_now ? "" : "muted"}>
                        {formatPhoneDisplay(p.phone_display)} · {p.position}/{p.total} · {p.origin}
                        {!p.eligible_now && p.next_eligible_at
                          ? ` · elegível ${formatSpDateTime(p.next_eligible_at)}`
                          : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}
          {ctx?.call_strategy?.lead_status === "aguardando_intervalo" && ctx.call_strategy.waiting_next_at ? (
            <p className="muted" style={{ marginTop: 8, fontSize: "0.8125rem" }}>
              Aguardando próxima tentativa — elegível a partir de {formatSpDateTime(ctx.call_strategy.waiting_next_at)}.
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? <div className="alert alert-error">{error}</div> : null}
      {contextLoading ? <p className="muted">Carregando dados da ligação…</p> : null}

      {step === "next_dial" && nextDial ? (
        <div>
          <p style={{ marginTop: 0 }}>
            Próximo número sugerido para este lead (a ligação não é disparada automaticamente). Você pode ligar, pular ou
            fechar.
          </p>
          <div className="panel" style={{ padding: 12, marginBottom: 12 }}>
            <strong>{nextDial.contact_name ?? "Próximo telefone"}</strong>
            <div>{formatPhoneDisplay(nextDial.phone_display || nextDial.phone)}</div>
            {nextDial.strategy ? (
              <div className="muted" style={{ fontSize: "0.75rem" }}>
                Telefone {nextDial.strategy.position} de {nextDial.strategy.total} · Origem: {nextDial.strategy.origin} ·{" "}
                {nextDial.strategy.attempt_label}
              </div>
            ) : (
              <div className="muted" style={{ fontSize: "0.75rem" }}>
                {nextDial.kind === "whatsapp" ? "WhatsApp / alternativo" : "Telefone"}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" className="btn" disabled={dialLoading} onClick={onClose}>
              Fechar
            </button>
            <button type="button" className="btn" disabled={dialLoading} onClick={() => void skipNextDial()}>
              Pular este número
            </button>
            <button type="button" className="btn" disabled={dialLoading} onClick={() => setStep("result")}>
              Registrar resultado
            </button>
            <button type="button" className="btn btn-primary" disabled={dialLoading} onClick={() => void dialNext()}>
              {dialLoading ? "Discando…" : "Ligar agora"}
            </button>
          </div>
        </div>
      ) : null}

      {step === "result" && !contextLoading && !callWasAnswered ? (
        <div>
          <p className="muted" style={{ marginTop: 0 }}>
            Ligação não atendida: o registro técnico e a tentativa sem contato são aplicados automaticamente. Não é
            necessário preencher resultado comercial.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" className="btn" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
      ) : null}

      {step === "result" && !contextLoading && callWasAnswered ? (
        <form onSubmit={submit}>
          {callId ? <CallDialContextBanner callId={callId} maxNoContact={maxNoContact} compact /> : null}
          {!call?.client_id ? (
            <div className="alert alert-error" style={{ marginBottom: 12 }}>
              Esta ligação não está vinculada a um cliente no CRM. Você pode dispensar o registro pendente ou fechar e
              ligar novamente pela ficha do lead.
            </div>
          ) : null}
          <CallThreeLayerRegistrationFields
            technicalLabel={technicalLabel}
            providerLabel={call?.technical_provider_label ?? call?.hangup_cause_label}
            providerCode={call?.technical_provider_code ?? call?.hangup_cause_code}
            contactTypes={contactTypes}
            contactOutcomeId={contactOutcomeId}
            onContactOutcomeChange={(id) => {
              setContactOutcomeId(id);
              if (!resultLockedByIntegration) setResultTypeId("");
            }}
            contactLocked={contactLocked}
            commercialTypes={commercialOptionsForContact.map((r) => {
              const full = bdrResultTypes.find((x) => x.id === r.id)!;
              const effective = resolveEffectiveBdrRules(full, attendanceRules);
              return {
                id: r.id,
                slug: r.slug,
                name: r.name,
                description: null,
                collect_notes: effective.collect_notes,
                require_schedule_return: effective.require_schedule_return
              };
            })}
            compatIds={compatIds}
            allowedCommercialIds={allowedCommercialIds}
            commercialId={resultTypeId}
            onCommercialChange={setResultTypeId}
            commercialLocked={resultLockedByIntegration}
            requiresConversation={selectedContact?.requires_conversation === true}
            contactedPersonName={contactedPersonName}
            onContactedPersonNameChange={setContactedPersonName}
            contactedPersonJobTitle={contactedPersonJobTitle}
            onContactedPersonJobTitleChange={setContactedPersonJobTitle}
            contactedPersonNotes={contactedPersonNotes}
            onContactedPersonNotesChange={setContactedPersonNotes}
            disabled={loading}
          />
          {selectedResult?.lead_qualification ? (
            <p className="muted" style={{ fontSize: "0.75rem", margin: "0 0 0.75rem" }}>
              Qualificação do lead: <strong>{LEAD_QUALIFICATION_LABELS[selectedResult.lead_qualification]}</strong>
            </p>
          ) : null}
          <div className="field">
            <label className="label">Produto</label>
            <p style={{ margin: 0, fontSize: "0.9375rem" }}>{productDisplayName ?? "—"}</p>
          </div>
          {showNotesField ? (
            <div className="field">
              <label className="label">Observações</label>
              <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} required />
            </div>
          ) : null}
          {showDecisionMakerField ? (
            <ApproachDecisionMakerField
              value={spokeWithDecisionMaker}
              onChange={setSpokeWithDecisionMaker}
              disabled={loading}
            />
          ) : null}
          {showRegistrationSteps ? (
            <ApproachNextStepField
              result={selectedResult}
              nextType={nextType}
              onNextTypeChange={setNextType}
              nextDate={nextDate}
              nextTime={nextTime}
              onNextDateChange={setNextDate}
              onNextTimeChange={setNextTime}
              reasonId={reasonId}
              onReasonIdChange={setReasonId}
              closureReasons={closureReasons}
            />
          ) : (
            <p className="muted" style={{ fontSize: "0.8125rem" }}>
              Este resultado não exige complemento de registro — confirme para concluir a ligação.
            </p>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
            {ctx && (ctx.call_strategy?.suggested || ctx.remaining.length > 0) ? (
              <button type="button" className="btn" onClick={() => setStep("next_dial")}>
                Outros números
              </button>
            ) : null}
            <button type="button" className="btn" onClick={onClose}>
              Fechar
            </button>
            {!call?.client_id ? (
              <button type="button" className="btn" disabled={loading} onClick={() => void dismissPending()}>
                Dispensar registro
              </button>
            ) : null}
            <button
              type="button"
              className="btn"
              disabled={loading || !call?.client_id}
              onClick={() => void submitDraft()}
            >
              Salvar rascunho
            </button>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading || !call?.client_id || resultTypes.length === 0}
            >
              {loading ? "Salvando…" : "Finalizar atendimento"}
            </button>
          </div>
        </form>
      ) : null}
    </>
  );

  return inner;
}

export function Api4comCallResultModal({
  callId,
  open,
  onClose,
  onCompleted,
  products
}: {
  callId: number | null;
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
  products: Product[];
}) {
  const [modalTitle, setModalTitle] = useState("COMPLEMENTO DE REGISTRO");

  return (
    <CadastroModal open={open} title={modalTitle} onClose={onClose}>
      <Api4comCallResultForm
        callId={callId}
        active={open}
        layout="modal"
        products={products}
        onClose={onClose}
        onCompleted={onCompleted}
        onModalTitleChange={setModalTitle}
      />
    </CadastroModal>
  );
}
