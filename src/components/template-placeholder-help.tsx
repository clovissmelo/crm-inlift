"use client";

import { HelpCircle } from "lucide-react";
import { PLACEHOLDER_HELP } from "@/lib/message-templates";

export function TemplatePlaceholderHelp({ showFlowNote = false }: { showFlowNote?: boolean }) {
  return (
    <span className="script-flow-help-wrap">
      <button type="button" className="script-flow-help-btn" aria-label="Variáveis disponíveis no texto">
        <HelpCircle size={15} aria-hidden />
      </button>
      <div className="script-flow-help-popover" role="tooltip">
        <p className="script-flow-help-popover-title">Variáveis no texto</p>
        <ul className="script-flow-help-list">
          {PLACEHOLDER_HELP.map((p) => (
            <li key={p.key}>
              <code>{p.key}</code>
              <span>{p.label}</span>
            </li>
          ))}
        </ul>
        {showFlowNote ? (
          <p className="muted script-flow-help-note">
            Etapas sequenciais usam <strong>Próximo</strong>; ramificações usam opções; anotações pedem campos
            (nome, telefone…) gravados na ligação.
          </p>
        ) : null}
      </div>
    </span>
  );
}
