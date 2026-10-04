"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, PanelRightClose, PanelRightOpen } from "lucide-react";
import {
  contactLayerFromScriptLog,
  normalizeCallScriptLog,
  type CallScriptLogEntry
} from "@/lib/call-script-log";
import { ApproachMinimalScheduleField } from "@/components/approach-minimal-schedule-field";
import {
  branchChoiceContactLayer,
  branchChoiceScheduleMeeting,
  captureFieldRegistrationLabel,
  contactRegisterFields,
  inputFieldsOnScreen,
  parseCallScriptBody,
  screenHasFillableFields,
  renderStepContent,
  screenCreatesContact,
  screenHasScheduleBlock,
  screenHasScheduleReturnBlock,
  screenRequiresScheduleInput,
  sequentialNext,
  type ScriptCallFlow,
  type ScriptScreen
} from "@/lib/script-flow";
import { spLocalDateTimeToIso } from "@/lib/datetime";
import { CallDialContextBanner } from "@/components/call-dial-context-banner";
import "./call-script-guide.css";

export type ActiveCallForScript = {
  id: number;
  client_id: number | null;
  product_id: number | null;
  client_name: string | null;
  product_name: string | null;
  contact_name: string | null;
  /** Preenchido no cliente com o usuário logado (quem conduz o script). */
  user_name?: string | null;
  status: string;
  script_flow_log?: unknown;
};

type Props = {
  call: ActiveCallForScript;
  scriptBody: string | null;
  /** Evita handoff antes do fetch do script (null ≠ “sem script”). */
  scriptReady?: boolean;
  onCollapse?: () => void;
  collapsed?: boolean;
  onExpand?: () => void;
  onLogUpdated?: (log: CallScriptLogEntry[]) => void;
  /** Ao concluir o roteiro, abre o complemento de registro no painel lateral. */
  onScriptFlowComplete?: () => void;
  /** Simulador: encerra o painel (ex.: ao lado de Reiniciar etapas). */
  onCloseSimulator?: () => void;
  embedded?: boolean;
};

export function callScriptStatusLabel(status: string) {
  if (status === "in_progress") return "Em chamada";
  if (status === "ringing") return "Chamando…";
  return "Ligação iniciada";
}

function stepIdFromLog(log: CallScriptLogEntry[], flow: ScriptCallFlow): string {
  if (log.length === 0) return flow.start;
  const last = log[log.length - 1]!;
  if (last.action === "restart") return flow.start;
  if (last.next_step_id && flow.screens[last.next_step_id]) return last.next_step_id;
  if (last.step_id && flow.screens[last.step_id]) return last.step_id;
  return flow.start;
}

export function CallScriptGuidePanel({
  call,
  scriptBody,
  scriptReady = true,
  collapsed,
  onCollapse,
  onExpand,
  onLogUpdated,
  onScriptFlowComplete,
  onCloseSimulator,
  embedded = false
}: Props) {
  const handoffSentRef = useRef(false);
  const [handoffPending, setHandoffPending] = useState(false);
  const flow = useMemo(() => (scriptBody ? parseCallScriptBody(scriptBody) : null), [scriptBody]);
  const savedLog = useMemo(() => normalizeCallScriptLog(call.script_flow_log), [call.script_flow_log]);
  const [stepId, setStepId] = useState<string | null>(null);
  const [logCount, setLogCount] = useState(savedLog.length);
  const [captureDraft, setCaptureDraft] = useState<Record<string, string>>({});
  const [pendingMeeting, setPendingMeeting] = useState<{ next: string | null; label: string } | null>(null);
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [meetingInvalid, setMeetingInvalid] = useState(false);
  const [captureContactNotice, setCaptureContactNotice] = useState<string | null>(null);

  useEffect(() => {
    handoffSentRef.current = false;
    setHandoffPending(false);
  }, [call.id]);

  useEffect(() => {
    setPendingMeeting(null);
    setMeetingDate("");
    setMeetingTime("");
    setMeetingInvalid(false);
  }, [stepId]);

  useEffect(() => {
    setLogCount(savedLog.length);
    if (!flow) {
      setStepId(null);
      return;
    }
    if (call.id < 0) {
      setStepId(savedLog.length === 0 ? flow.start : stepIdFromLog(savedLog, flow));
      return;
    }
    setStepId(stepIdFromLog(savedLog, flow));
  }, [flow, call.id, scriptBody, savedLog]);

  useEffect(() => {
    if (!stepId || !flow) {
      setCaptureDraft({});
      return;
    }
    const current = flow.screens[stepId];
    if (!current || !screenHasFillableFields(current)) {
      setCaptureDraft({});
      return;
    }
    const fields = inputFieldsOnScreen(current);
    const lastForStep = [...savedLog]
      .reverse()
      .find((e) => e.step_id === stepId && e.action === "capture");
    if (!lastForStep?.capture_notes?.length) {
      setCaptureDraft({});
      return;
    }
    const draft: Record<string, string> = {};
    for (const note of lastForStep.capture_notes) {
      const field = fields.find((f) => f.label === note.label || f.key === note.field_key);
      if (field) draft[field.key] = note.value;
    }
    setCaptureDraft(draft);
  }, [stepId, flow, savedLog]);

  useEffect(() => {
    if (!scriptReady) return;
    if (!scriptBody || !flow) {
      maybeOpenRegistrationHandoff();
      return;
    }
  }, [scriptReady, scriptBody, flow, call.id]);

  function maybeOpenRegistrationHandoff() {
    if (handoffSentRef.current) return;
    handoffSentRef.current = true;
    setHandoffPending(true);
    onScriptFlowComplete?.();
  }

  const vars = useMemo(
    () => ({
      contato_nome: call.contact_name,
      cliente_nome: call.client_name,
      produto_nome: call.product_name,
      usuario_nome: call.user_name
    }),
    [call.contact_name, call.client_name, call.product_name, call.user_name]
  );

  async function persistLog(entry: Omit<CallScriptLogEntry, "at"> & { capture_notes?: CallScriptLogEntry["capture_notes"] }) {
    const payload: Omit<CallScriptLogEntry, "at"> = { ...entry };
    const screenForLog =
      flow && entry.step_id ? (flow.screens[entry.step_id] ?? null) : null;
    if (
      entry.action === "choice" &&
      choiceLabelFromEntry(entry) &&
      screenForLog?.navigation.mode === "branch"
    ) {
      const layer = branchChoiceContactLayer(screenForLog, choiceLabelFromEntry(entry)!);
      if (layer) payload.contact_layer = layer;
    }

    if (call.id < 0) {
      const prev = normalizeCallScriptLog(call.script_flow_log);
      const nextLog: CallScriptLogEntry[] = [...prev, { ...payload, at: new Date().toISOString() }];
      setLogCount(nextLog.length);
      onLogUpdated?.(nextLog);
      return;
    }

    const res = await fetch(`/api/api4com/calls/${call.id}/script-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      log?: CallScriptLogEntry[];
      contact_created?: { id: number; step_id: string };
    };
    if (data.log) {
      setLogCount(data.log.length);
      onLogUpdated?.(data.log);
    }
    if (data.contact_created?.id) {
      setCaptureContactNotice(`Contato #${data.contact_created.id} salvo na ficha do cliente.`);
    }
  }

  function choiceLabelFromEntry(entry: Omit<CallScriptLogEntry, "at">) {
    return entry.choice_label?.trim() || null;
  }

  if (collapsed) {
    return (
      <div className={embedded ? "call-script-collapsed call-script-collapsed--embedded" : "call-script-collapsed"}>
        <button type="button" className="btn btn-primary" onClick={onExpand} title="Abrir script da ligação">
          <PanelRightOpen size={18} aria-hidden />
          Script da ligação
        </button>
      </div>
    );
  }

  const screen: ScriptScreen | null = flow && stepId ? (flow.screens[stepId] ?? null) : null;
  const isSimulation = call.id < 0;
  const showStepTitleBanner = isSimulation && screen;
  const canGoBack = normalizeCallScriptLog(call.script_flow_log).length > 0;
  const scriptContactLayer = contactLayerFromScriptLog(normalizeCallScriptLog(call.script_flow_log));

  async function syncFullLog(nextLog: CallScriptLogEntry[]) {
    if (call.id < 0) {
      setLogCount(nextLog.length);
      onLogUpdated?.(nextLog);
      return;
    }
    const res = await fetch(`/api/api4com/calls/${call.id}/script-log`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ log: nextLog })
    });
    if (!res.ok) return;
    const data = (await res.json()) as { log?: CallScriptLogEntry[] };
    if (data.log) {
      setLogCount(data.log.length);
      onLogUpdated?.(data.log);
    }
  }

  function goBack() {
    if (!flow || !canGoBack) return;
    handoffSentRef.current = false;
    setHandoffPending(false);
    const prev = normalizeCallScriptLog(call.script_flow_log);
    const trimmed = prev.slice(0, -1);
    void syncFullLog(trimmed);
    setStepId(stepIdFromLog(trimmed, flow));
  }

  function goNext(
    next: string | null,
    action: "next" | "choice" | "capture",
    choiceLabel?: string,
    captureNotes?: CallScriptLogEntry["capture_notes"],
    scheduledMeetingAt?: string | null,
    scheduledReturnAt?: string | null
  ) {
    if (!screen || !stepId) return;
    const payload: Omit<CallScriptLogEntry, "at"> = {
      step_id: stepId,
      step_title: screen.title,
      action,
      choice_label: choiceLabel ?? null,
      next_step_id: next,
      capture_notes: captureNotes,
      scheduled_meeting_at: scheduledMeetingAt ?? null,
      scheduled_return_at: scheduledReturnAt ?? null
    };
    if (action === "choice" && choiceLabel?.trim() && screen.navigation.mode === "branch") {
      const layer = branchChoiceContactLayer(screen, choiceLabel.trim());
      if (layer) payload.contact_layer = layer;
    }

    if (call.id < 0) {
      const prev = normalizeCallScriptLog(call.script_flow_log);
      const nextLog: CallScriptLogEntry[] = [...prev, { ...payload, at: new Date().toISOString() }];
      setLogCount(nextLog.length);
      onLogUpdated?.(nextLog);
      if (next && flow?.screens[next]) setStepId(next);
      else {
        setStepId(null);
        maybeOpenRegistrationHandoff();
      }
      return;
    }

    void persistLog(payload);
    if (next && flow?.screens[next]) setStepId(next);
    else {
      setStepId(null);
      maybeOpenRegistrationHandoff();
    }
  }

  function restartFlow() {
    if (!flow) return;
    handoffSentRef.current = false;
    setHandoffPending(false);
    void persistLog({
      step_id: stepId ?? flow.start,
      step_title: screen?.title ?? "Roteiro",
      action: "restart",
      next_step_id: flow.start
    });
    setStepId(flow.start);
  }

  function onBranchChoice(next: string | null, label: string) {
    if (screen?.navigation.mode === "branch" && branchChoiceScheduleMeeting(screen, label)) {
      setPendingMeeting({ next, label });
      return;
    }
    goNext(next, "choice", label);
  }

  function confirmPendingMeeting() {
    if (!pendingMeeting) return;
    if (!meetingDate.trim() || !meetingTime.trim()) {
      setMeetingInvalid(true);
      return;
    }
    setMeetingInvalid(false);
    const iso = spLocalDateTimeToIso(meetingDate, meetingTime);
    goNext(pendingMeeting.next, "choice", pendingMeeting.label, undefined, iso);
    setPendingMeeting(null);
  }

  function buildCaptureNotes(scr: ScriptScreen) {
    const notes: CallScriptLogEntry["capture_notes"] = [];
    for (const block of scr.blocks) {
      if (block.kind === "notes") {
        for (const f of block.fields) {
          const value = (captureDraft[f.key] ?? "").trim();
          if (!value) continue;
          notes.push({
            label: captureFieldRegistrationLabel(f, scriptContactLayer),
            value,
            field_key: f.key
          });
        }
      }
      if (block.kind === "contact_register") {
        for (const f of contactRegisterFields(block)) {
          const value = (captureDraft[f.key] ?? "").trim();
          if (!value) continue;
          notes.push({
            label: captureFieldRegistrationLabel(f, scriptContactLayer),
            value,
            field_key: f.key
          });
        }
      }
    }
    return notes;
  }

  function advanceSequential() {
    if (!screen || !flow || !stepId) return;
    const next = sequentialNext(flow, stepId);
    let meetingIso: string | null = null;
    let returnIso: string | null = null;
    if (screenRequiresScheduleInput(screen)) {
      if (!meetingDate.trim() || !meetingTime.trim()) {
        setMeetingInvalid(true);
        return;
      }
      setMeetingInvalid(false);
      const iso = spLocalDateTimeToIso(meetingDate, meetingTime);
      if (screenHasScheduleBlock(screen)) meetingIso = iso;
      if (screenHasScheduleReturnBlock(screen)) returnIso = iso;
    }
    const notes = buildCaptureNotes(screen);
    const shouldCapture =
      screenHasFillableFields(screen) && (notes.length > 0 || screenCreatesContact(screen));
    if (shouldCapture) {
      goNext(next, "capture", undefined, notes.length ? notes : undefined, meetingIso, returnIso);
      return;
    }
    goNext(next, "next", undefined, undefined, meetingIso, returnIso);
  }

  const seqNext = screen && flow && stepId ? sequentialNext(flow, stepId) : null;
  const hasNextScreen = Boolean(seqNext && flow?.screens[seqNext]);

  return (
    <>
      {embedded ? null : <div className="call-script-backdrop" aria-hidden />}
      <aside
        className={embedded ? "call-script-panel call-script-panel--embedded" : "call-script-panel"}
        aria-label="Script da ligação"
      >
        <header className="call-script-panel-head">
          <div>
            <h2>{callScriptStatusLabel(call.status)}</h2>
            <p className="call-script-panel-meta">
              {[call.client_name, call.product_name].filter(Boolean).join(" · ") || "Cliente"}
            </p>
          </div>
          <button type="button" className="btn btn-icon-sm" onClick={onCollapse} title="Recolher script">
            <PanelRightClose size={18} aria-hidden />
          </button>
        </header>

        <div className="call-script-panel-body">
          {showStepTitleBanner ? (
            <div className="panel call-script-step-banner">{screen!.title}</div>
          ) : (
            <CallDialContextBanner callId={call.id} compact />
          )}
          {!flow || !screen ? (
            <p className="muted">
              {!scriptBody
                ? "Nenhum script de ligação ativo para este produto. Cadastre em Abordagens."
                : "Abrindo complemento de registro…"}
            </p>
          ) : screen.navigation.mode === "branch" && pendingMeeting ? (
            <div className="call-script-meeting-pick">
              <p className="muted" style={{ fontSize: "0.875rem", margin: "0 0 8px" }}>
                Opção: <strong>{pendingMeeting.label}</strong> — informe data e hora da reunião.
              </p>
              <ApproachMinimalScheduleField
                mode="meeting"
                nextDate={meetingDate}
                nextTime={meetingTime}
                onNextDateChange={setMeetingDate}
                onNextTimeChange={setMeetingTime}
                invalidSchedule={meetingInvalid}
              />
              <div className="call-script-nav-row">
                <button type="button" className="btn" onClick={() => setPendingMeeting(null)}>
                  Voltar
                </button>
                <button type="button" className="btn btn-primary call-script-btn-next" onClick={confirmPendingMeeting}>
                  Confirmar reunião
                  <ChevronRight size={18} aria-hidden />
                </button>
              </div>
            </div>
          ) : (
            <>
              {!showStepTitleBanner ? <h3 className="call-script-step-title">{screen.title}</h3> : null}
              {screen.blocks.map((block) => {
                if (block.kind === "text") {
                  const text = renderStepContent(block.content, vars);
                  if (!text.trim()) return null;
                  return (
                    <p key={block.id} className="call-script-step-content">
                      {text}
                    </p>
                  );
                }
                if (block.kind === "notes") {
                  return (
                    <div key={block.id} className="call-script-capture-fields">
                      {block.fields.map((field) => (
                        <label key={field.key} className="call-script-capture-field">
                          <span className="label">
                            {captureFieldRegistrationLabel(field, scriptContactLayer)}
                          </span>
                          {field.input === "textarea" ? (
                            <textarea
                              className="textarea"
                              rows={3}
                              placeholder={field.placeholder}
                              value={captureDraft[field.key] ?? ""}
                              onChange={(e) =>
                                setCaptureDraft((d) => ({ ...d, [field.key]: e.target.value }))
                              }
                            />
                          ) : (
                            <input
                              className="input"
                              type={field.input === "tel" ? "tel" : "text"}
                              placeholder={field.placeholder}
                              value={captureDraft[field.key] ?? ""}
                              onChange={(e) =>
                                setCaptureDraft((d) => ({ ...d, [field.key]: e.target.value }))
                              }
                            />
                          )}
                        </label>
                      ))}
                    </div>
                  );
                }
                if (block.kind === "contact_register") {
                  return (
                    <div key={block.id} className="call-script-capture-fields call-script-contact-register-fields">
                      {contactRegisterFields(block).map((field) => (
                        <label key={field.key} className="call-script-capture-field">
                          <span className="label">
                            {captureFieldRegistrationLabel(field, scriptContactLayer)}
                          </span>
                          <input
                            className="input"
                            type={field.input === "tel" ? "tel" : "text"}
                            placeholder={field.placeholder}
                            value={captureDraft[field.key] ?? ""}
                            onChange={(e) =>
                              setCaptureDraft((d) => ({ ...d, [field.key]: e.target.value }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  );
                }
                if (block.kind === "schedule_meeting" || block.kind === "schedule_return") {
                  return (
                    <div key={block.id} className="call-script-meeting-pick">
                      <p className="muted" style={{ fontSize: "0.875rem", margin: "0 0 8px" }}>
                        {block.prompt?.trim() ||
                          (block.kind === "schedule_meeting"
                            ? "Agendar reunião — informe data e hora."
                            : "Agendar retorno — informe data e hora.")}
                      </p>
                      <ApproachMinimalScheduleField
                        mode={block.kind === "schedule_meeting" ? "meeting" : "return"}
                        nextDate={meetingDate}
                        nextTime={meetingTime}
                        onNextDateChange={setMeetingDate}
                        onNextTimeChange={setMeetingTime}
                        invalidSchedule={meetingInvalid}
                      />
                    </div>
                  );
                }
                return null;
              })}
              {screenHasFillableFields(screen) ? (
                <p className="muted call-script-capture-hint">
                  Dados ficam na ligação e no complemento de registro.
                  {screenCreatesContact(screen) ? (
                    <>
                      {" "}
                      Com nome preenchido, cria/atualiza contato no cliente
                      {isSimulation ? " (simulação — não grava.)" : "."}
                    </>
                  ) : null}
                </p>
              ) : null}
              {captureContactNotice ? (
                <p className="call-script-capture-hint" style={{ color: "var(--success, #86efac)" }}>
                  {captureContactNotice}
                </p>
              ) : null}
              {screen.navigation.mode === "branch" ? (
                <>
                  <div className="call-script-actions">
                    <p className="call-script-branch-q">{screen.navigation.question}</p>
                    {screen.navigation.choices.map((choice) => (
                      <button
                        key={choice.label}
                        type="button"
                        className="btn btn-primary call-script-btn-choice"
                        onClick={() => onBranchChoice(choice.next, choice.label)}
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                  <div className="call-script-nav-row">
                    <button type="button" className="btn call-script-btn-back" disabled={!canGoBack} onClick={goBack}>
                      <ChevronLeft size={18} aria-hidden />
                      Voltar
                    </button>
                  </div>
                </>
              ) : hasNextScreen || screenHasFillableFields(screen) ? (
                <div className="call-script-nav-row">
                  <button type="button" className="btn call-script-btn-back" disabled={!canGoBack} onClick={goBack}>
                    <ChevronLeft size={18} aria-hidden />
                    Voltar
                  </button>
                  <button type="button" className="btn btn-primary call-script-btn-next" onClick={() => advanceSequential()}>
                    {screenHasFillableFields(screen)
                      ? hasNextScreen
                        ? "Salvar e continuar"
                        : "Salvar e concluir"
                      : "Próximo"}
                    <ChevronRight size={18} aria-hidden />
                  </button>
                </div>
              ) : (
                <>
                  {handoffPending ? (
                    <p className="muted" style={{ fontSize: "0.875rem", margin: "0 0 8px" }}>
                      Abrindo complemento de registro…
                    </p>
                  ) : null}
                  <div className="call-script-nav-row">
                    <button type="button" className="btn call-script-btn-back" disabled={!canGoBack} onClick={goBack}>
                      <ChevronLeft size={18} aria-hidden />
                      Voltar
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary call-script-btn-next"
                      disabled={handoffPending}
                      onClick={() => advanceSequential()}
                    >
                      Concluir e registrar
                      <ChevronRight size={18} aria-hidden />
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <footer className="call-script-panel-foot">
          <div className="call-script-panel-foot-actions">
            <button type="button" className="btn" disabled={!flow} onClick={restartFlow}>
              Reiniciar etapas
            </button>
            {onCloseSimulator ? (
              <button type="button" className="btn" onClick={onCloseSimulator}>
                Fechar
              </button>
            ) : null}
          </div>
          <span className="muted" style={{ fontSize: "0.75rem" }}>
            {logCount > 0 ? `${logCount} registro(s) na ligação` : "Seleções gravadas na ligação"}
          </span>
        </footer>
      </aside>
    </>
  );
}
