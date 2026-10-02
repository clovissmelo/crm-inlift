"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, PanelRightClose, PanelRightOpen } from "lucide-react";
import { normalizeCallScriptLog, type CallScriptLogEntry } from "@/lib/call-script-log";
import {
  parseCallScriptBody,
  renderStepContent,
  type ScriptFlow,
  type ScriptFlowStep
} from "@/lib/script-flow";
import { CallDialContextBanner } from "@/components/call-dial-context-banner";
import "./call-script-guide.css";

export type ActiveCallForScript = {
  id: number;
  client_id: number | null;
  product_id: number | null;
  client_name: string | null;
  product_name: string | null;
  contact_name: string | null;
  status: string;
  script_flow_log?: unknown;
};

type Props = {
  call: ActiveCallForScript;
  scriptBody: string | null;
  onCollapse?: () => void;
  collapsed?: boolean;
  onExpand?: () => void;
  onLogUpdated?: (log: CallScriptLogEntry[]) => void;
  /** Ao concluir o roteiro, abre o complemento de registro no painel lateral. */
  onScriptFlowComplete?: () => void;
};

export function callScriptStatusLabel(status: string) {
  if (status === "in_progress") return "Em chamada";
  if (status === "ringing") return "Chamando…";
  return "Ligação iniciada";
}

function stepIdFromLog(log: CallScriptLogEntry[], flow: ScriptFlow): string {
  if (log.length === 0) return flow.start;
  const last = log[log.length - 1]!;
  if (last.action === "restart") return flow.start;
  if (last.next_step_id && flow.steps[last.next_step_id]) return last.next_step_id;
  if (last.step_id && flow.steps[last.step_id]) return last.step_id;
  return flow.start;
}

export function CallScriptGuidePanel({
  call,
  scriptBody,
  collapsed,
  onCollapse,
  onExpand,
  onLogUpdated,
  onScriptFlowComplete
}: Props) {
  const handoffSentRef = useRef(false);
  const flow = useMemo(() => (scriptBody ? parseCallScriptBody(scriptBody) : null), [scriptBody]);
  const savedLog = useMemo(() => normalizeCallScriptLog(call.script_flow_log), [call.script_flow_log]);
  const [stepId, setStepId] = useState<string | null>(null);
  const [logCount, setLogCount] = useState(savedLog.length);

  useEffect(() => {
    handoffSentRef.current = false;
  }, [call.id]);

  useEffect(() => {
    setLogCount(savedLog.length);
    if (!flow) {
      setStepId(null);
      return;
    }
    setStepId(stepIdFromLog(savedLog, flow));
  }, [flow, call.id, scriptBody, savedLog.length]);

  useEffect(() => {
    if (!flow || !stepId) return;
    const current = flow.steps[stepId];
    if (!current) return;
    const atEnd =
      current.type === "linear"
        ? !current.next
        : current.choices.every((c) => !c.next);
    if (!atEnd) return;
    if (handoffSentRef.current) return;
    handoffSentRef.current = true;
    onScriptFlowComplete?.();
  }, [flow, stepId, onScriptFlowComplete]);

  function maybeOpenRegistrationHandoff() {
    if (handoffSentRef.current) return;
    handoffSentRef.current = true;
    onScriptFlowComplete?.();
  }

  const vars = useMemo(
    () => ({
      contato_nome: call.contact_name,
      cliente_nome: call.client_name,
      produto_nome: call.product_name
    }),
    [call.contact_name, call.client_name, call.product_name]
  );

  async function persistLog(entry: Omit<CallScriptLogEntry, "at">) {
    const res = await fetch(`/api/api4com/calls/${call.id}/script-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry)
    });
    if (!res.ok) return;
    const data = (await res.json()) as { log?: CallScriptLogEntry[] };
    if (data.log) {
      setLogCount(data.log.length);
      onLogUpdated?.(data.log);
    }
  }

  if (collapsed) {
    return (
      <div className="call-script-collapsed">
        <button type="button" className="btn btn-primary" onClick={onExpand} title="Abrir script da ligação">
          <PanelRightOpen size={18} aria-hidden />
          Script da ligação
        </button>
      </div>
    );
  }

  const step: ScriptFlowStep | null = flow && stepId ? (flow.steps[stepId] ?? null) : null;

  function goNext(next: string | null, action: "next" | "choice", choiceLabel?: string) {
    if (!step || !stepId) return;
    void persistLog({
      step_id: stepId,
      step_title: step.title,
      action,
      choice_label: choiceLabel ?? null,
      next_step_id: next
    });
    if (next && flow?.steps[next]) setStepId(next);
    else {
      setStepId(null);
      maybeOpenRegistrationHandoff();
    }
  }

  function restartFlow() {
    if (!flow) return;
    void persistLog({
      step_id: stepId ?? flow.start,
      step_title: step?.title ?? "Roteiro",
      action: "restart",
      next_step_id: flow.start
    });
    setStepId(flow.start);
  }

  return (
    <>
      <div className="call-script-backdrop" aria-hidden />
      <aside className="call-script-panel" aria-label="Script da ligação">
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
          <CallDialContextBanner callId={call.id} compact />
          {!flow || !step ? (
            <p className="muted">
              {!scriptBody
                ? "Nenhum script de ligação ativo para este produto. Cadastre em Abordagens."
                : "Fim do roteiro ou etapa inválida. Use Reiniciar abaixo."}
            </p>
          ) : (
            <>
              <h3 className="call-script-step-title">{step.title}</h3>
              <p className="call-script-step-content">{renderStepContent(step.content, vars)}</p>
              {step.type === "branch" ? (
                <>
                  <p className="call-script-branch-q">{step.question}</p>
                  <div className="call-script-actions">
                    {step.choices.map((choice) => (
                      <button
                        key={choice.label}
                        type="button"
                        className="btn btn-primary call-script-btn-choice"
                        onClick={() => goNext(choice.next, "choice", choice.label)}
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : step.next && flow.steps[step.next] ? (
                <div className="call-script-actions">
                  <button
                    type="button"
                    className="btn btn-primary call-script-btn-next"
                    onClick={() => goNext(step.type === "linear" ? step.next : null, "next")}
                  >
                    Próximo
                    <ChevronRight size={20} style={{ marginLeft: 8, verticalAlign: "middle" }} aria-hidden />
                  </button>
                </div>
              ) : (
                <p className="muted" style={{ fontSize: "0.875rem" }}>
                  Fim deste fluxo. Continue a conversa ou encerre a ligação.
                </p>
              )}
            </>
          )}
        </div>

        <footer className="call-script-panel-foot">
          <button type="button" className="btn" disabled={!flow} onClick={restartFlow}>
            Reiniciar etapas
          </button>
          <span className="muted" style={{ fontSize: "0.75rem" }}>
            {logCount > 0 ? `${logCount} registro(s) na ligação` : "Seleções gravadas na ligação"}
          </span>
        </footer>
      </aside>
    </>
  );
}
