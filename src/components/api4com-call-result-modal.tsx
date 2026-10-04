"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CadastroModal } from "@/components/cadastro-ui";
import type { LeadQualification } from "@/lib/lead-qualification";
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
  listAnsweredCommercialOptions,
  resolveAllowedCommercialIds,
  resolveEffectiveBdrRules
} from "@/lib/attendance/bdr-registration";
import type { TechnicalResultTypeRow } from "@/lib/classifications/technical-result-match";
import {
  contactLayerFromScriptLog,
  formatCallScriptLogForNotes,
  normalizeCallScriptLog,
  personFromScriptLog,
  type CallScriptLogEntry
} from "@/lib/call-script-log";
import { ApproachMinimalScheduleField } from "@/components/approach-minimal-schedule-field";
import { type ApproachNextActionKey } from "@/lib/approach-next-actions";
import {
  contactSlugForLayerChoice,
  contactLayerRequiresPersonName,
  layerChoiceFromContactSlug,
  resolveContactLayerOptions,
  spokeWithDecisionMakerForChoice,
  type ContactLayerChoice
} from "@/lib/attendance/call-contact-layer";
import { CallRegistrationHeader } from "@/components/call-registration-header";
import { ComplementObservationsTextarea } from "@/components/complement-observations-textarea";
import { confirmProceedIfClientHasAgenda } from "@/lib/client-agenda-warning";
import {
  callRequiresComplementRegistration,
  callTelephonyResultLabel
} from "@/lib/api4com/call-registration";

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

export type CallRegistrationSimulation = {
  /** Pré-seleciona um resultado comercial (teste pontual). */
  initialCommercialResultId?: number;
  /** Cenário de telefonia escolhido no simulador admin. */
  telephony?: {
    technicalSlug: string;
    technicalDisplayName: string;
    answeredAt: string | null;
    durationSeconds: number;
  };
  productId?: number;
  scriptFlowLog?: CallScriptLogEntry[];
};

type ResultFormProps = {
  callId: number | null;
  active: boolean;
  layout: "modal" | "panel";
  onClose: () => void;
  onCompleted: () => void;
  products: Product[];
  onModalTitleChange?: (title: string) => void;
  /** Mesmo complemento da ligação, com cliente fictício — não persiste abordagem. */
  simulation?: CallRegistrationSimulation;
};

export function Api4comCallResultForm({
  callId,
  active,
  layout,
  onClose,
  onCompleted,
  products,
  onModalTitleChange,
  simulation
}: ResultFormProps) {
  const isSimulation = Boolean(simulation);
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
  const [contactLayerChoice, setContactLayerChoice] = useState<ContactLayerChoice | null>(null);
  const [contactLayerLocked, setContactLayerLocked] = useState(false);
  const [, setTechnicalTypes] = useState<TechnicalResultTypeRow[]>([]);
  const [contactTypes, setContactTypes] = useState<ContactOutcomeOption[]>([]);
  const [compatMap, setCompatMap] = useState<Record<string, number[]>>({});
  const [attendanceRules, setAttendanceRules] = useState<AttendanceRuleLite[]>([]);
  const [contactOutcomeId, setContactOutcomeId] = useState("");
  const autoSettleRef = useRef<number | null>(null);
  const scriptContactPrefillKeyRef = useRef("");
  const [technicalSlug, setTechnicalSlug] = useState<string | null>(null);
  const [technicalLabel, setTechnicalLabel] = useState("");
  const [contactedPersonName, setContactedPersonName] = useState("");
  const [contactedPersonJobTitle, setContactedPersonJobTitle] = useState("");
  const [personFieldsFromScript, setPersonFieldsFromScript] = useState(false);
  const [personFieldsEditing, setPersonFieldsEditing] = useState(false);
  const [simulationFeedback, setSimulationFeedback] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    commercial?: boolean;
    contact?: boolean;
    notes?: boolean;
    personName?: boolean;
    nextSchedule?: boolean;
  }>({});

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
      callTelephonyResultLabel(
        slug,
        ctxData.call.technical_display_name ??
          (techRow && "display_name" in techRow ? techRow.display_name : null)
      )
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
    const initialChoice = layerChoiceFromContactSlug(
      contacts.find((c) => String(c.id) === suggestions.contactId)?.slug
    );
    setContactLayerChoice(initialChoice);
    setContactLayerLocked(suggestions.lockContact);

    setStep("result");
  }

  const loadContext = useCallback(async () => {
    if (!callId && !simulation) return;
    setError(null);
    setSimulationFeedback(null);
    setContextLoading(true);
    try {
      if (simulation) {
        const [classRes, crRes, attRes] = await Promise.all([
          fetch("/api/approach-classifications"),
          fetch("/api/closure-reason-types"),
          fetch("/api/attendance-rules")
        ]);
        if (attRes.ok) {
          const att = (await attRes.json()) as { items?: AttendanceRuleLite[] };
          setAttendanceRules(att.items ?? []);
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
          requires_meeting?: boolean;
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
          allowed_next_actions: c.allowed_next_actions,
          requires_meeting: c.requires_meeting === true
        }));
        if (!classRes.ok) {
          setError(classJson.error ?? "Não foi possível carregar classificações.");
        }
        setTechnicalTypes(techTypes);
        setContactTypes(contacts);
        setCompatMap(classJson.contact_commercial_compat ?? {});
        setResultTypes(activeResults);

        const mockProductId = simulation.productId ?? products[0]?.id ?? null;
        const now = new Date().toISOString();
        const tel = simulation.telephony;
        const mockCall: CallDetail = {
          id: -1,
          api4com_call_id: "simulation",
          client_id: 1,
          contact_id: 1,
          product_id: mockProductId,
          phone_dialed: "5511999990000",
          started_at: now,
          ended_at: now,
          duration_seconds: tel?.durationSeconds ?? 36,
          hangup_cause_code: null,
          hangup_cause_label: "NORMAL_CLEARING",
          answered_at: tel?.answeredAt ?? now,
          technical_display_name: tel?.technicalDisplayName ?? "Atendeu",
          technical_slug: tel?.technicalSlug ?? "answered",
          client_name: "Empresa Exemplo Ltda",
          contact_name: "Clóvis Melo",
          record_url: null,
          script_flow_log: simulation.scriptFlowLog ?? null
        };
        const ctxData: DialContext = {
          call: mockCall,
          session_root_id: -1,
          remaining: [],
          skipped: [],
          session_calls: [],
          client_product_ids: mockProductId != null ? [mockProductId] : [],
          current_phone: {
            client_phone_id: 0,
            phone: mockCall.phone_dialed,
            phone_display: mockCall.phone_dialed,
            origin: "simulation",
            position: 1,
            total: 1,
            status: "active",
            attempt_label: "Simulação",
            next_eligible_at: null,
            last_attempt_at: now,
            last_bucket: "simulation",
            eligible_now: true,
            primary_contact_id: 1,
            counter_line: null,
            counter_lines: [],
            needs_review: false
          }
        };
        applyCallContext(ctxData, activeResults, techTypes, contacts, commercialRaw);
        if (simulation.initialCommercialResultId != null) {
          setResultTypeId(String(simulation.initialCommercialResultId));
          setContactOutcomeId("");
          setContactLayerChoice(null);
          setContactLayerLocked(false);
          setContactLocked(false);
          setResultLockedByIntegration(false);
        }
        setStep("result");
        return;
      }

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
  }, [callId, simulation, products]);

  useEffect(() => {
    if (!active || (!callId && !simulation)) return;
    setCtx(null);
    setResultTypes([]);
    setResultTypeId("");
    setResultLockedByIntegration(false);
    setContactLocked(false);
    setContactOutcomeId("");
    setContactLayerChoice(null);
    setContactLayerLocked(false);
    setTechnicalSlug(null);
    setTechnicalLabel("");
    setNotes("");
    setNextType("none");
    setReasonId("");
    setNextDate("");
    setNextTime("");
    setContactedPersonName("");
    setContactedPersonJobTitle("");
    setPersonFieldsFromScript(false);
    setPersonFieldsEditing(false);
    setStep("result");
    void loadContext();
  }, [active, callId, simulation, loadContext]);

  useEffect(() => {
    autoSettleRef.current = null;
    scriptContactPrefillKeyRef.current = "";
  }, [callId, simulation?.scriptFlowLog]);

  const modalTitle =
    step === "next_dial" ? "Ligar para outro contato?" : "COMPLEMENTO DE REGISTRO";

  useEffect(() => {
    if (layout === "modal") onModalTitleChange?.(modalTitle);
  }, [layout, modalTitle, onModalTitleChange]);

  const selectedResultBase = resultTypes.find((r) => String(r.id) === resultTypeId);
  const allowedCommercialIds = useMemo(
    () =>
      resolveAllowedCommercialIds(
        attendanceRules,
        resultTypes.map((r) => ({ id: r.id, slug: r.slug, name: r.name })),
        null,
        compatMap
      ),
    [attendanceRules, resultTypes, compatMap]
  );

  const callWasAnswered = useMemo(
    () =>
      call
        ? callRequiresComplementRegistration({
            answered_at: call.answered_at,
            technical_slug: technicalSlug ?? call.technical_slug,
            duration_seconds: call.duration_seconds
          })
        : false,
    [call, technicalSlug]
  );

  useEffect(() => {
    if (isSimulation) return;
    if (!active || !callId || contextLoading || !call || step !== "result") return;
    if (callWasAnswered) return;
    if (autoSettleRef.current === callId) return;
    autoSettleRef.current = callId;

    void (async () => {
      try {
        await fetch(`/api/api4com/calls/${callId}/auto-settle`, { method: "POST" });
      } catch {
        /* ignore */
      }
      onCompleted();
      onClose();
    })();
  }, [active, callId, contextLoading, call, callWasAnswered, step, onClose, onCompleted, isSimulation]);

  const bdrResultTypes = useMemo(() => {
    const base = listAnsweredCommercialOptions(
      attendanceRules,
      resultTypes.map((r) => ({ id: r.id, slug: r.slug, name: r.name }))
    );
    if (attendanceRules.length === 0) return resultTypes;
    return resultTypes.filter((r) => base.some((b) => b.id === r.id));
  }, [resultTypes, attendanceRules]);

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

  const nenhumContatoType = useMemo(
    () => contactTypes.find((c) => c.slug === "nenhum_contato"),
    [contactTypes]
  );

  useEffect(() => {
    if (!resultTypeId || resultLockedByIntegration || !callWasAnswered) return;
    const commercial = resultTypes.find((r) => String(r.id) === resultTypeId);
    if (!commercial) return;

    if (commercial.slug === "sem_contato" && nenhumContatoType) {
      setContactLayerChoice("ninguem");
      setContactOutcomeId(String(nenhumContatoType.id));
      setContactLayerLocked(true);
      return;
    }

    setContactLayerLocked(false);
    const options = resolveContactLayerOptions({
      callAnswered: callWasAnswered,
      commercialSlug: commercial.slug,
      nenhumContatoTypeId: nenhumContatoType?.id ?? null,
      commercialTypeId: commercial.id,
      compatMap
    });
    setContactLayerChoice((prev) => {
      if (prev && !options.includes(prev)) {
        setContactOutcomeId("");
        return null;
      }
      return prev;
    });
  }, [resultTypeId, resultTypes, resultLockedByIntegration, callWasAnswered, nenhumContatoType, compatMap]);

  useEffect(() => {
    if (!contactLayerChoice) return;
    const slug = contactSlugForLayerChoice(contactLayerChoice);
    const contact = contactTypes.find((c) => c.slug === slug);
    if (contact) setContactOutcomeId(String(contact.id));
  }, [contactLayerChoice, contactTypes]);

  useEffect(() => {
    if (!call || contextLoading || !callWasAnswered || contactLocked) return;
    const commercial = resultTypes.find((r) => String(r.id) === resultTypeId);
    if (!commercial || commercial.slug === "sem_contato") return;
    const layer = contactLayerFromScriptLog(normalizeCallScriptLog(call.script_flow_log));
    if (!layer) return;
    const options = resolveContactLayerOptions({
      callAnswered: callWasAnswered,
      commercialSlug: commercial.slug,
      nenhumContatoTypeId: nenhumContatoType?.id ?? null,
      commercialTypeId: commercial.id,
      compatMap
    });
    if (!options.includes(layer)) return;
    const logLen = normalizeCallScriptLog(call.script_flow_log).length;
    const key = `${call.id}:${logLen}:${layer}:${resultTypeId}`;
    if (scriptContactPrefillKeyRef.current === key) return;
    scriptContactPrefillKeyRef.current = key;
    setContactLayerChoice(layer);
    setContactLayerLocked(false);
  }, [
    call,
    callWasAnswered,
    contextLoading,
    contactLocked,
    resultTypeId,
    resultTypes,
    nenhumContatoType,
    compatMap
  ]);

  useEffect(() => {
    if (!call || contextLoading) return;
    if (contactLayerChoice !== "decisor" && contactLayerChoice !== "outra") return;
    const { name, jobTitle } = personFromScriptLog(normalizeCallScriptLog(call.script_flow_log));
    if (!name.trim()) return;
    setContactedPersonName(name);
    setContactedPersonJobTitle(jobTitle);
    setPersonFieldsFromScript(true);
    setPersonFieldsEditing(false);
  }, [call, call?.script_flow_log, contactLayerChoice, contextLoading]);

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
  const showReturnSchedule = selectedResult?.require_schedule_return === true;
  const showMeetingSchedule = selectedResult?.requires_meeting === true;
  const spokeWithDecisionMaker = spokeWithDecisionMakerForChoice(contactLayerChoice);

  useEffect(() => {
    if (!selectedResult) return;
    if (selectedResult.requires_meeting) setNextType("schedule_meeting");
    else if (selectedResult.require_schedule_return) setNextType("schedule_return");
    else setNextType("none");
  }, [selectedResult?.id, selectedResult?.requires_meeting, selectedResult?.require_schedule_return]);
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

  function validateFinalForm(): string | null {
    const err: typeof fieldErrors = {};
    let msg: string | null = null;
    const mark = (m: string) => {
      if (!msg) msg = m;
    };

    if (!call?.client_id) mark("Esta ligação não está vinculada a um cliente no CRM.");
    if (!resultTypeId) {
      err.commercial = true;
      mark("Selecione o resultado comercial.");
    }
    if (!contactLayerChoice || !contactOutcomeId) {
      err.contact = true;
      mark("Selecione o contato na ligação.");
    }
    if (contactLayerRequiresPersonName(contactLayerChoice) && !contactedPersonName.trim()) {
      err.personName = true;
      mark("Informe o nome para o histórico.");
    }
    if (selectedResult?.collect_notes === true && !notes.trim()) {
      err.notes = true;
      mark("Informe as observações exigidas para este resultado.");
    }
    if (selectedResult && showRegistrationSteps) {
      if (
        (showReturnSchedule || showMeetingSchedule) &&
        (!nextDate.trim() || !nextTime.trim())
      ) {
        err.nextSchedule = true;
        mark("Informe data e hora.");
      }
    }

    setFieldErrors(err);
    return msg;
  }

  async function saveRegistration(registrationStatus: "draft" | "final") {
    if (registrationStatus === "final") {
      const validationMsg = validateFinalForm();
      if (validationMsg) {
        setError(validationMsg);
        return;
      }
    } else {
      setFieldErrors({});
    }
    if (!call || !call.client_id || !resultTypeId || !contactOutcomeId) return;

    setLoading(true);
    setError(null);
    setFieldErrors({});

    if (isSimulation && registrationStatus === "final") {
      setSimulationFeedback("Validação concluída — nenhum dado foi gravado.");
      setLoading(false);
      return;
    }

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
      if (!resolvedProductId) {
        setError("Produto não identificado para este registro.");
        setLoading(false);
        return;
      }
      const kind = nextType === "pause" ? "pause" : "close";
      const autoReason =
        reasonId ||
        String(closureReasons.find((r) => r.kind === kind)?.id ?? "");
      if (!autoReason) {
        setError("Nenhum motivo de encerramento configurado no sistema.");
        setLoading(false);
        return;
      }
      next_action = {
        type: nextType,
        product_id: resolvedProductId,
        reason_id: Number(autoReason)
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
        contacted_person_notes: null,
        registration_status: registrationStatus,
        notes: finalNotes || null,
        external_call_id: call.api4com_call_id,
        spoke_with_decision_maker: spokeWithDecisionMaker,
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

  const duration =
    call?.duration_seconds != null
      ? `${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, "0")}`
      : "—";

  if (!active || (!callId && !simulation)) return null;

  const inner = (
    <>
      {isSimulation ? (
        <p className="call-reg-simulation-note muted" role="status">
          Modo teste — mesmo fluxo da ligação real; nada é gravado no banco.
        </p>
      ) : null}
      {simulationFeedback ? (
        <div className="alert" style={{ marginBottom: 12 }}>
          {simulationFeedback}
        </div>
      ) : null}
      {call ? (
        <CallRegistrationHeader
          clientName={call.client_name}
          contactName={call.contact_name}
          productName={productDisplayName}
          phoneDialed={call.phone_dialed}
          endedAt={call.ended_at}
          durationLabel={duration}
          callAnswered={callWasAnswered}
          technicalSlug={technicalSlug ?? call.technical_slug}
          technicalLabel={technicalLabel}
          hangupCauseLabel={call.hangup_cause_label}
          recordUrl={call.record_url}
          callId={call.id}
          hideRecording={isSimulation}
          lastAttemptAt={currentPhone?.last_attempt_at}
          lastAttemptBucket={currentPhone?.last_bucket}
          waitingNextAt={
            ctx?.call_strategy?.lead_status === "aguardando_intervalo"
              ? ctx.call_strategy.waiting_next_at
              : null
          }
        />
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
          <p className="call-reg-unanswered-lead">
            {(technicalSlug ?? call?.technical_slug) === "no_answer" ? (
              <>
                <strong>Chamou e não atendeu.</strong> O CRM registra a tentativa sem contato —{" "}
                <strong>sem</strong> complemento comercial manual.
              </>
            ) : (
              <>
                A ligação foi feita, mas <strong>não houve atendimento</strong>. O CRM registra o resultado técnico e a
                tentativa sem contato — <strong>sem</strong> complemento comercial manual.
              </>
            )}
          </p>
          <div className="panel call-reg-unanswered-summary">
            <p style={{ margin: "0 0 6px" }}>
              <span className="label" style={{ display: "inline", marginRight: 6 }}>
                Resultado da ligação
              </span>
              <strong>
                {callTelephonyResultLabel(technicalSlug ?? call?.technical_slug, technicalLabel)}
              </strong>
            </p>
            <p style={{ margin: 0 }}>
              <span className="label" style={{ display: "inline", marginRight: 6 }}>
                Registro comercial
              </span>
              <strong>
                {resultTypes.find((r) => String(r.id) === resultTypeId)?.name ?? "Sem contato"}
              </strong>
              <span className="muted"> · automático</span>
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 16 }}>
            {isSimulation ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  setSimulationFeedback(
                    "Encerramento automático simulado — registro técnico e tentativa sem contato, sem gravação no banco."
                  )
                }
              >
                Simular encerramento automático
              </button>
            ) : null}
            <button type="button" className="btn" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
      ) : null}

      {step === "result" && !contextLoading && callWasAnswered ? (
        <form className="call-reg-complement-form" onSubmit={submit}>
          {!call?.client_id ? (
            <div className="alert alert-error" style={{ marginBottom: 12 }}>
              Esta ligação não está vinculada a um cliente no CRM. Você pode dispensar o registro pendente ou fechar e
              ligar novamente pela ficha do lead.
            </div>
          ) : null}
          <CallThreeLayerRegistrationFields
            callAnswered={callWasAnswered}
            technicalSlug={technicalSlug ?? call?.technical_slug}
            technicalLabel={technicalLabel}
            contactTypes={contactTypes}
            contactLayerChoice={contactLayerChoice}
            onContactLayerChoiceChange={(v) => {
              setContactLayerChoice(v);
              setFieldErrors((e) => ({ ...e, contact: false, personName: false }));
            }}
            contactLayerLocked={contactLayerLocked || contactLocked}
            commercialTypes={bdrResultTypes.map((r) => {
              const effective = resolveEffectiveBdrRules(r, attendanceRules);
              return {
                id: r.id,
                slug: r.slug,
                name: r.name,
                description: null,
                collect_notes: effective.collect_notes,
                require_schedule_return: effective.require_schedule_return
              };
            })}
            allowedCommercialIds={allowedCommercialIds}
            commercialId={resultTypeId}
            onCommercialChange={(id) => {
              setResultTypeId(id);
              setFieldErrors((e) => ({ ...e, commercial: false }));
              if (!resultLockedByIntegration) {
                setContactLayerChoice(null);
                setContactOutcomeId("");
                setContactLayerLocked(false);
              }
            }}
            commercialLocked={resultLockedByIntegration}
            compatMap={compatMap}
            contactedPersonName={contactedPersonName}
            onContactedPersonNameChange={(v) => {
              setPersonFieldsFromScript(false);
              setContactedPersonName(v);
            }}
            contactedPersonJobTitle={contactedPersonJobTitle}
            onContactedPersonJobTitleChange={(v) => {
              setPersonFieldsFromScript(false);
              setContactedPersonJobTitle(v);
            }}
            personFieldsCompact={personFieldsFromScript && !personFieldsEditing}
            onEditPersonFields={() => setPersonFieldsEditing(true)}
            invalidFields={fieldErrors}
            disabled={loading}
          />
          {showNotesField ? (
            <div className={fieldErrors.notes ? "field field--invalid" : "field"}>
              <label className="label">Observações</label>
              <ComplementObservationsTextarea
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setFieldErrors((f) => ({ ...f, notes: false }));
                }}
                required
              />
              {fieldErrors.notes ? <p className="call-reg-invalid-hint">Preencha as observações.</p> : null}
            </div>
          ) : null}
          {showRegistrationSteps && showMeetingSchedule ? (
            <ApproachMinimalScheduleField
              mode="meeting"
              nextDate={nextDate}
              nextTime={nextTime}
              onNextDateChange={(v) => {
                setNextDate(v);
                setFieldErrors((f) => ({ ...f, nextSchedule: false }));
              }}
              onNextTimeChange={(v) => {
                setNextTime(v);
                setFieldErrors((f) => ({ ...f, nextSchedule: false }));
              }}
              invalidSchedule={fieldErrors.nextSchedule}
            />
          ) : null}
          {showRegistrationSteps && showReturnSchedule && !showMeetingSchedule ? (
            <ApproachMinimalScheduleField
              mode="return"
              nextDate={nextDate}
              nextTime={nextTime}
              onNextDateChange={(v) => {
                setNextDate(v);
                setFieldErrors((f) => ({ ...f, nextSchedule: false }));
              }}
              onNextTimeChange={(v) => {
                setNextTime(v);
                setFieldErrors((f) => ({ ...f, nextSchedule: false }));
              }}
              invalidSchedule={fieldErrors.nextSchedule}
            />
          ) : null}
          {!showRegistrationSteps ? (
            <p className="muted" style={{ fontSize: "0.8125rem" }}>
              Este resultado não exige complemento de registro — confirme para concluir a ligação.
            </p>
          ) : null}
          <div style={{ display: "flex", justifyContent: "stretch", marginTop: 16 }}>
            <button
              className="btn btn-primary"
              type="submit"
              style={{ width: "100%" }}
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
