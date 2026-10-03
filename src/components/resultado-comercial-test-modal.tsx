"use client";

import { useEffect, useMemo, useState } from "react";
import { CadastroModal } from "@/components/cadastro-ui";
import { ApproachMinimalScheduleField } from "@/components/approach-minimal-schedule-field";
import {
  CallThreeLayerRegistrationFields,
  type ContactOutcomeOption
} from "@/components/call-three-layer-registration-fields";
import {
  contactSlugForLayerChoice,
  resolveContactLayerOptions,
  spokeWithDecisionMakerForChoice,
  type ContactLayerChoice
} from "@/lib/attendance/call-contact-layer";
import { resolveEffectiveBdrRules, type AttendanceRuleForUi } from "@/lib/attendance/bdr-registration";

type ResultRow = {
  id: number;
  name: string;
  slug: string;
  collect_notes?: boolean;
  require_schedule_return?: boolean;
  require_final_registration?: boolean;
  requires_meeting?: boolean;
  allowed_next_actions?: unknown;
};

export function ResultadoComercialTestModal({
  open,
  onClose,
  result
}: {
  open: boolean;
  onClose: () => void;
  result: ResultRow | null;
}) {
  const [contactTypes, setContactTypes] = useState<ContactOutcomeOption[]>([]);
  const [compatMap, setCompatMap] = useState<Record<string, number[]>>({});
  const [attendanceRules, setAttendanceRules] = useState<AttendanceRuleForUi[]>([]);
  const [callAnswered, setCallAnswered] = useState(true);
  const [contactLayerChoice, setContactLayerChoice] = useState<ContactLayerChoice | null>(null);
  const [contactOutcomeId, setContactOutcomeId] = useState("");
  const [personName, setPersonName] = useState("");
  const [personJob, setPersonJob] = useState("");
  const [personNotes, setPersonNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("");
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCallAnswered(true);
    setContactLayerChoice(null);
    setContactOutcomeId("");
    setPersonName("");
    setPersonJob("");
    setPersonNotes("");
    setNotes("");
    setNextDate("");
    setNextTime("");
    setBanner(null);
    void (async () => {
      const [classRes, attRes] = await Promise.all([
        fetch("/api/approach-classifications"),
        fetch("/api/attendance-rules")
      ]);
      if (classRes.ok) {
        const data = (await classRes.json()) as {
          contact?: ContactOutcomeOption[];
          contact_commercial_compat?: Record<string, number[]>;
        };
        setContactTypes(data.contact ?? []);
        setCompatMap(data.contact_commercial_compat ?? {});
      }
      if (attRes.ok) {
        const att = (await attRes.json()) as { items?: AttendanceRuleForUi[] };
        setAttendanceRules(att.items ?? []);
      }
    })();
  }, [open, result?.id]);

  const effective = useMemo(() => {
    if (!result) return null;
    return resolveEffectiveBdrRules(result, attendanceRules);
  }, [result, attendanceRules]);

  const nenhumType = contactTypes.find((c) => c.slug === "nenhum_contato");

  useEffect(() => {
    if (!result || !open) return;
    if (!callAnswered && nenhumType) {
      setContactLayerChoice("ninguem");
      setContactOutcomeId(String(nenhumType.id));
      return;
    }
    if (result.slug === "sem_contato" && nenhumType) {
      setContactLayerChoice("ninguem");
      setContactOutcomeId(String(nenhumType.id));
      return;
    }
    const options = resolveContactLayerOptions({
      callAnswered,
      commercialSlug: result.slug,
      nenhumContatoTypeId: nenhumType?.id ?? null,
      commercialTypeId: result.id,
      compatMap
    });
    if (contactLayerChoice && !options.includes(contactLayerChoice)) {
      setContactLayerChoice(null);
      setContactOutcomeId("");
    }
  }, [result, callAnswered, nenhumType, compatMap, open, contactLayerChoice]);

  useEffect(() => {
    if (!contactLayerChoice) return;
    const slug = contactSlugForLayerChoice(contactLayerChoice);
    const contact = contactTypes.find((c) => c.slug === slug);
    if (contact) setContactOutcomeId(String(contact.id));
  }, [contactLayerChoice, contactTypes]);

  if (!open || !result) return null;

  const commercialTypes = [
    {
      id: result.id,
      slug: result.slug,
      name: result.name,
      description: null,
      collect_notes: effective?.collect_notes,
      require_schedule_return: effective?.require_schedule_return
    }
  ];

  function simulateSave(e: React.FormEvent) {
    e.preventDefault();
    if (!result) return;
    const parts = [
      `Simulação — ${result.name}`,
      `Atendeu: ${callAnswered ? "Sim" : "Não"}`,
      contactLayerChoice ? `Contato: ${contactLayerChoice}` : "Contato: (pendente)",
      spokeWithDecisionMakerForChoice(contactLayerChoice) === true
        ? "Decisor: Sim"
        : spokeWithDecisionMakerForChoice(contactLayerChoice) === false
          ? "Decisor: Não"
          : null,
      personName ? `Pessoa: ${personName}` : null,
      notes ? `Obs: ${notes}` : null,
      nextDate && nextTime ? `Retorno: ${nextDate} ${nextTime}` : null
    ].filter(Boolean);
    setBanner(parts.join(" · "));
  }

  const showNotes = effective?.collect_notes !== false;
  const showReturn = effective?.require_schedule_return === true;
  const showMeeting = effective?.requires_meeting === true;
  const layerLocked = !callAnswered || result.slug === "sem_contato";

  return (
    <CadastroModal open={open} title={`Testar — ${result.name}`} onClose={onClose} wide>
      <p className="muted" style={{ marginTop: 0, fontSize: "0.875rem" }}>
        Cliente fictício: <strong>Empresa Exemplo Ltda</strong> · (11) 99999-0000 · PostoCred. Nada é gravado no banco.
      </p>
      {banner ? (
        <div className="alert" style={{ marginBottom: 12 }}>
          {banner}
        </div>
      ) : null}
      <form onSubmit={simulateSave}>
        <div className="field">
          <label className="label">Simular telefonia</label>
          <div className="call-contact-layer-picker" role="group" aria-label="Atendeu">
            <button
              type="button"
              className={`call-contact-layer-btn ${callAnswered ? "is-active" : "is-inactive"}`}
              onClick={() => setCallAnswered(true)}
            >
              Atendeu
            </button>
            <button
              type="button"
              className={`call-contact-layer-btn ${!callAnswered ? "is-active" : "is-inactive"}`}
              onClick={() => setCallAnswered(false)}
            >
              Não atendeu
            </button>
          </div>
        </div>
        <CallThreeLayerRegistrationFields
          callAnswered={callAnswered}
          technicalLabel={callAnswered ? "Atendeu" : "Não atendeu"}
          contactTypes={contactTypes}
          contactLayerChoice={contactLayerChoice}
          onContactLayerChoiceChange={setContactLayerChoice}
          contactLayerLocked={layerLocked && contactLayerChoice === "ninguem"}
          commercialTypes={commercialTypes}
          commercialId={String(result.id)}
          onCommercialChange={() => {}}
          commercialLocked
          compatMap={compatMap}
          contactedPersonName={personName}
          onContactedPersonNameChange={setPersonName}
          contactedPersonJobTitle={personJob}
          onContactedPersonJobTitleChange={setPersonJob}
          contactedPersonNotes={personNotes}
          onContactedPersonNotesChange={setPersonNotes}
          invalidFields={{}}
        />
        {showNotes ? (
          <div className="field">
            <label className="label">Observações</label>
            <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        ) : null}
        {showMeeting ? (
          <ApproachMinimalScheduleField
            mode="meeting"
            nextDate={nextDate}
            nextTime={nextTime}
            onNextDateChange={setNextDate}
            onNextTimeChange={setNextTime}
          />
        ) : null}
        {showReturn && !showMeeting ? (
          <ApproachMinimalScheduleField
            mode="return"
            nextDate={nextDate}
            nextTime={nextTime}
            onNextDateChange={setNextDate}
            onNextTimeChange={setNextTime}
          />
        ) : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className="btn" onClick={onClose}>
            Fechar
          </button>
          <button type="submit" className="btn btn-primary">
            Simular finalização
          </button>
        </div>
      </form>
    </CadastroModal>
  );
}
