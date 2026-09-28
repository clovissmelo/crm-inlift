"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, PanelRightClose, PanelRightOpen } from "lucide-react";
import {
  parseCallScriptBody,
  renderStepContent,
  type ScriptFlow,
  type ScriptFlowStep
} from "@/lib/script-flow";
import "./call-script-guide.css";

export type ActiveCallForScript = {
  id: number;
  client_id: number | null;
  product_id: number | null;
  client_name: string | null;
  product_name: string | null;
  contact_name: string | null;
  status: string;
};

type Props = {
  call: ActiveCallForScript;
  scriptBody: string | null;
  onCollapse?: () => void;
  collapsed?: boolean;
  onExpand?: () => void;
};

function stepLabel(status: string) {
  if (status === "in_progress") return "Em chamada";
  if (status === "ringing") return "Chamando…";
  return "Ligação iniciada";
}

export function CallScriptGuidePanel({ call, scriptBody, collapsed, onCollapse, onExpand }: Props) {
  const flow = useMemo(() => (scriptBody ? parseCallScriptBody(scriptBody) : null), [scriptBody]);
  const [stepId, setStepId] = useState<string | null>(null);

  useEffect(() => {
    setStepId(flow?.start ?? null);
  }, [flow?.start, call.id, scriptBody]);

  const vars = useMemo(
    () => ({
      contato_nome: call.contact_name,
      cliente_nome: call.client_name,
      produto_nome: call.product_name
    }),
    [call.contact_name, call.client_name, call.product_name]
  );

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

  function goNext(next: string | null) {
    if (next && flow?.steps[next]) setStepId(next);
    else setStepId(null);
  }

  return (
    <>
      <div className="call-script-backdrop" aria-hidden />
      <aside className="call-script-panel" aria-label="Script da ligação">
        <header className="call-script-panel-head">
          <div>
            <h2>{stepLabel(call.status)}</h2>
            <p className="call-script-panel-meta">
              {[call.client_name, call.product_name].filter(Boolean).join(" · ") || "Cliente"}
            </p>
          </div>
          <button type="button" className="btn btn-icon-sm" onClick={onCollapse} title="Recolher script">
            <PanelRightClose size={18} aria-hidden />
          </button>
        </header>

        <div className="call-script-panel-body">
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
                        onClick={() => goNext(choice.next)}
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
                    onClick={() => goNext(step.type === "linear" ? step.next : null)}
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
          <button
            type="button"
            className="btn"
            disabled={!flow}
            onClick={() => setStepId(flow?.start ?? null)}
          >
            Reiniciar etapas
          </button>
          <span className="muted" style={{ fontSize: "0.75rem" }}>
            Guia · não grava abordagem
          </span>
        </footer>
      </aside>
    </>
  );
}
