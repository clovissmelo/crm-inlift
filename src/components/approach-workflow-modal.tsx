"use client";

import { useEffect, useMemo, useState } from "react";
import { CadastroModal } from "@/components/cadastro-ui";
import type { Product } from "@/lib/types";
import type { ClientContact } from "@/components/client-detail-view";
import { ApproachMinimalScheduleField } from "@/components/approach-minimal-schedule-field";
import {
  CallThreeLayerRegistrationFields,
  type ContactOutcomeOption
} from "@/components/call-three-layer-registration-fields";
import {
  contactSlugForLayerChoice,
  contactLayerRequiresPersonName,
  resolveContactLayerOptions,
  spokeWithDecisionMakerForChoice,
  type ContactLayerChoice
} from "@/lib/attendance/call-contact-layer";
import { confirmProceedIfClientHasAgenda } from "@/lib/client-agenda-warning";
import {
  resolveEffectiveBdrRules,
  type AttendanceRuleForUi
} from "@/lib/attendance/bdr-registration";
import { ComplementObservationsTextarea } from "@/components/complement-observations-textarea";
import { type ApproachNextActionKey } from "@/lib/approach-next-actions";

type ResultType = {
  id: number;
  slug: string;
  name: string;
  suggest_follow_up: boolean;
  collect_notes?: boolean;
  require_schedule_return?: boolean;
  require_final_registration?: boolean;
  ask_decision_maker?: boolean;
  requires_meeting?: boolean;
  allowed_next_actions?: unknown;
  lead_qualification?: string | null;
};
type ClosureReason = { id: number; name: string; kind: "pause" | "close" };

function spInputToIso(date: string, time: string) {
  if (!date || !time) return new Date().toISOString();
  return new Date(`${date}T${time}:00-03:00`).toISOString();
}

export function ApproachWorkflowModal({
  open,
  onClose,
  clientId,
  clientName,
  contacts,
  products,
  defaultChannel,
  defaultContactId,
  defaultProductId,
  followUpId
}: {
  open: boolean;
  onClose: () => void;
  clientId: number;
  clientName: string;
  contacts: ClientContact[];
  products: Product[];
  defaultChannel: "call" | "whatsapp" | "email";
  defaultContactId?: number;
  defaultProductId?: number;
  followUpId?: number;
}) {
  const [resultTypes, setResultTypes] = useState<ResultType[]>([]);
  const [attendanceRules, setAttendanceRules] = useState<AttendanceRuleForUi[]>([]);
  const [closureReasons, setClosureReasons] = useState<ClosureReason[]>([]);
  const [contactTypes, setContactTypes] = useState<ContactOutcomeOption[]>([]);
  const [compatMap, setCompatMap] = useState<Record<string, number[]>>({});
  const [channel, setChannel] = useState(defaultChannel);
  const [contactId, setContactId] = useState<string>(defaultContactId ? String(defaultContactId) : "");
  const [productId, setProductId] = useState<string>(defaultProductId ? String(defaultProductId) : "");
  const [resultTypeId, setResultTypeId] = useState("");
  const [notes, setNotes] = useState("");
  const [usePast, setUsePast] = useState(false);
  const [pastDate, setPastDate] = useState("");
  const [pastTime, setPastTime] = useState("");
  const [nextType, setNextType] = useState<ApproachNextActionKey>("none");
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [contactLayerChoice, setContactLayerChoice] = useState<ContactLayerChoice | null>(null);
  const [contactOutcomeId, setContactOutcomeId] = useState("");
  const [contactedPersonName, setContactedPersonName] = useState("");
  const [contactedPersonJobTitle, setContactedPersonJobTitle] = useState("");

  const resolvedProductId =
    defaultProductId ?? (products.length === 1 ? products[0].id : products.length > 0 ? products[0].id : null);
  const productDisplayName =
    resolvedProductId != null ? products.find((p) => p.id === resolvedProductId)?.name ?? null : null;

  useEffect(() => {
    if (!open) return;
    setChannel(defaultChannel);
    setContactId(defaultContactId ? String(defaultContactId) : "");
    setProductId(resolvedProductId != null ? String(resolvedProductId) : "");
    setContactLayerChoice(null);
    setContactOutcomeId("");
    setContactedPersonName("");
    void (async () => {
      const [rt, cr, ar, classRes] = await Promise.all([
        fetch("/api/approach-result-types").then((r) => r.json()),
        fetch("/api/closure-reason-types").then((r) => r.json()),
        fetch("/api/attendance-rules").then((r) => r.json()),
        fetch("/api/approach-classifications").then((r) => r.json())
      ]);
      setResultTypes(
        (rt as { items: Array<ResultType & { status?: string }> }).items.filter(
          (i) => i.id && (!i.status || i.status === "active")
        )
      );
      setClosureReasons((cr as { items: ClosureReason[] }).items);
      setAttendanceRules((ar as { items: AttendanceRuleForUi[] }).items ?? []);
      const cls = classRes as { contact?: ContactOutcomeOption[]; contact_commercial_compat?: Record<string, number[]> };
      setContactTypes(cls.contact ?? []);
      setCompatMap(cls.contact_commercial_compat ?? {});
    })();
  }, [open, defaultChannel, defaultContactId, defaultProductId, resolvedProductId]);

  const selectedResult = resultTypes.find((r) => String(r.id) === resultTypeId);
  const effectiveResult = selectedResult ? resolveEffectiveBdrRules(selectedResult, attendanceRules) : null;
  const showNotesField = effectiveResult?.collect_notes === true;
  const showRegistrationSteps =
    effectiveResult?.requires_meeting === true || effectiveResult?.require_final_registration !== false;
  const showReturnSchedule = effectiveResult?.require_schedule_return === true;
  const showMeetingSchedule = effectiveResult?.requires_meeting === true;
  const spokeWithDecisionMaker = spokeWithDecisionMakerForChoice(contactLayerChoice);

  const nenhumType = useMemo(() => contactTypes.find((c) => c.slug === "nenhum_contato"), [contactTypes]);

  useEffect(() => {
    if (!selectedResult) return;
    if (selectedResult.requires_meeting) setNextType("schedule_meeting");
    else if (selectedResult.require_schedule_return) setNextType("schedule_return");
    else setNextType("none");
  }, [selectedResult?.id, selectedResult?.requires_meeting, selectedResult?.require_schedule_return]);

  useEffect(() => {
    if (!resultTypeId || !selectedResult) return;
    if (selectedResult.slug === "sem_contato" && nenhumType) {
      setContactLayerChoice("ninguem");
      setContactOutcomeId(String(nenhumType.id));
      return;
    }
    const options = resolveContactLayerOptions({
      callAnswered: true,
      commercialSlug: selectedResult.slug,
      nenhumContatoTypeId: nenhumType?.id ?? null,
      commercialTypeId: selectedResult.id,
      compatMap
    });
    if (contactLayerChoice && !options.includes(contactLayerChoice)) {
      setContactLayerChoice(null);
      setContactOutcomeId("");
    }
  }, [resultTypeId, selectedResult, nenhumType, compatMap, contactLayerChoice]);

  useEffect(() => {
    if (!contactLayerChoice) return;
    const slug = contactSlugForLayerChoice(contactLayerChoice);
    const contact = contactTypes.find((c) => c.slug === slug);
    if (contact) setContactOutcomeId(String(contact.id));
  }, [contactLayerChoice, contactTypes]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!contactLayerChoice || !contactOutcomeId) {
      setError("Selecione o contato na conversa.");
      setLoading(false);
      return;
    }
    if (contactLayerRequiresPersonName(contactLayerChoice) && !contactedPersonName.trim()) {
      setError("Informe o nome para o histórico.");
      setLoading(false);
      return;
    }

    if (effectiveResult) {
      if (
        (showReturnSchedule || showMeetingSchedule) &&
        (!nextDate.trim() || !nextTime.trim())
      ) {
        setError("Informe data e hora.");
        setLoading(false);
        return;
      }
    }

    let next_action: Record<string, unknown> = { type: "none" };
    if (nextType === "schedule_return" || nextType === "schedule_meeting") {
      const proceed = await confirmProceedIfClientHasAgenda(clientId);
      if (!proceed) {
        setLoading(false);
        return;
      }
      next_action = {
        type: nextType,
        scheduled_at: spInputToIso(nextDate, nextTime),
        contact_id: contactId ? Number(contactId) : null,
        product_id: productId ? Number(productId) : null,
        notes: null
      };
    } else if (nextType === "pause" || nextType === "close") {
      if (!productId || !reasonId) {
        setError("Informe produto e motivo.");
        setLoading(false);
        return;
      }
      next_action = { type: nextType, product_id: Number(productId), reason_id: Number(reasonId) };
    }

    const res = await fetch("/api/approaches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        contact_id: contactId ? Number(contactId) : null,
        product_id: productId ? Number(productId) : null,
        channel,
        occurred_at: usePast ? spInputToIso(pastDate, pastTime) : null,
        result_type_id: Number(resultTypeId),
        contact_outcome_type_id: Number(contactOutcomeId),
        contacted_person_name: contactedPersonName.trim() || null,
        contacted_person_job_title: contactedPersonJobTitle.trim() || null,
        contacted_person_notes: null,
        notes: notes || null,
        follow_up_id: followUpId,
        spoke_with_decision_maker: spokeWithDecisionMaker,
        next_action
      })
    });
    const data = (await res.json()) as { error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Erro ao registrar");
      return;
    }
    onClose();
    window.location.reload();
  }

  if (!open) return null;

  const commercialTypesForForm = selectedResult
    ? [
        {
          id: selectedResult.id,
          slug: selectedResult.slug,
          name: selectedResult.name,
          description: null,
          collect_notes: effectiveResult?.collect_notes,
          require_schedule_return: effectiveResult?.require_schedule_return
        }
      ]
    : resultTypes.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        description: null
      }));

  return (
    <CadastroModal open={open} title={`Registrar abordagem — ${clientName}`} onClose={onClose} wide>
      <form className="call-reg-complement-form" onSubmit={submit}>
        {error ? <div className="alert alert-error">{error}</div> : null}
        <div className="filters-row">
          <div className="field">
            <label className="label">Canal</label>
            <select className="select" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
              <option value="call">Ligação</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">E-mail</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Contato</label>
            <select className="select" value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">—</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Produto</label>
            {productDisplayName ? (
              <p style={{ margin: 0, fontSize: "0.9375rem" }}>{productDisplayName}</p>
            ) : (
              <select className="select" value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">—</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        {resultTypeId && selectedResult ? (
          <CallThreeLayerRegistrationFields
            callAnswered
            technicalLabel={channel === "call" ? "Registro manual (atendida)" : "Contato realizado"}
            contactTypes={contactTypes}
            contactLayerChoice={contactLayerChoice}
            onContactLayerChoiceChange={setContactLayerChoice}
            contactLayerLocked={selectedResult.slug === "sem_contato"}
            commercialTypes={commercialTypesForForm}
            commercialId={resultTypeId}
            onCommercialChange={(id) => {
              setResultTypeId(id);
              setContactLayerChoice(null);
              setContactOutcomeId("");
            }}
            commercialLocked={false}
            compatMap={compatMap}
            contactedPersonName={contactedPersonName}
            onContactedPersonNameChange={setContactedPersonName}
            contactedPersonJobTitle={contactedPersonJobTitle}
            onContactedPersonJobTitleChange={setContactedPersonJobTitle}
          />
        ) : (
          <div className="field">
            <label className="label">Resultado comercial *</label>
            <select
              className="select"
              value={resultTypeId}
              onChange={(e) => setResultTypeId(e.target.value)}
              required
            >
              <option value="">Selecione</option>
              {resultTypes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {showNotesField ? (
          <div className="field">
            <label className="label">Observações</label>
            <ComplementObservationsTextarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        ) : null}
        <label style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input type="checkbox" checked={usePast} onChange={(e) => setUsePast(e.target.checked)} />
          Data retroativa
        </label>
        {usePast ? (
          <div className="filters-row">
            <div className="field">
              <label className="label">Data</label>
              <input className="input" type="date" value={pastDate} onChange={(e) => setPastDate(e.target.value)} required={usePast} />
            </div>
            <div className="field">
              <label className="label">Horário</label>
              <input className="input" type="time" value={pastTime} onChange={(e) => setPastTime(e.target.value)} required={usePast} />
            </div>
          </div>
        ) : null}

        {showRegistrationSteps && showMeetingSchedule ? (
          <ApproachMinimalScheduleField
            mode="meeting"
            nextDate={nextDate}
            nextTime={nextTime}
            onNextDateChange={setNextDate}
            onNextTimeChange={setNextTime}
          />
        ) : null}
        {showRegistrationSteps && showReturnSchedule && !showMeetingSchedule ? (
          <ApproachMinimalScheduleField
            mode="return"
            nextDate={nextDate}
            nextTime={nextTime}
            onNextDateChange={setNextDate}
            onNextTimeChange={setNextTime}
          />
        ) : null}

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            Salvar abordagem
          </button>
          <button className="btn" type="button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </CadastroModal>
  );
}
