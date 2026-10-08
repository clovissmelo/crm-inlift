"use client";

import clsx from "clsx";
import { Phone, PhoneOff, X } from "lucide-react";
import type { WebphoneRegistrationState } from "@/components/api4com-webphone-provider";

const STATUS_LABEL: Record<WebphoneRegistrationState, string> = {
  idle: "Desconectado",
  loading: "Carregando discador…",
  connecting: "Conectando ramal…",
  registered: "Ramal online",
  error: "Erro na telefonia",
  needs_config: "Configuração pendente"
};

export function Api4comWebphoneDock({
  open,
  onClose,
  status,
  statusDetail,
  extension,
  targetUserName,
  onConnect,
  connecting
}: {
  open: boolean;
  onClose: () => void;
  status: WebphoneRegistrationState;
  statusDetail: string | null;
  extension: string | null;
  targetUserName: string | null;
  onConnect: () => void;
  connecting: boolean;
}) {
  if (!open) return null;

  const online = status === "registered";

  return (
    <div className="api4com-webphone-dock" role="region" aria-label="Discador API4COM">
      <div className="api4com-webphone-dock-inner panel">
        <div className="api4com-webphone-dock-head">
          <div className="api4com-webphone-dock-title">
            <Phone size={18} aria-hidden />
            <span>Telefonia no CRM</span>
            <span
              className={clsx(
                "api4com-webphone-dot",
                online && "api4com-webphone-dot--online",
                status === "connecting" || status === "loading" ? "api4com-webphone-dot--busy" : null,
                status === "error" ? "api4com-webphone-dot--error" : null
              )}
              aria-hidden
            />
          </div>
          <button type="button" className="btn btn-icon-sm" onClick={onClose} aria-label="Fechar painel">
            <X size={18} />
          </button>
        </div>
        <p className="api4com-webphone-dock-status">
          <strong>{STATUS_LABEL[status]}</strong>
          {extension ? (
            <>
              {" "}
              · ramal <code>{extension}</code>
            </>
          ) : null}
          {targetUserName ? <> ({targetUserName})</> : null}
        </p>
        {statusDetail ? <p className="muted api4com-webphone-dock-detail">{statusDetail}</p> : null}
        {!online && status !== "needs_config" ? (
          <p className="muted api4com-webphone-dock-detail">
            Se você usa a extensão Webphone da API4COM, feche-a — só uma conexão SIP por ramal.
          </p>
        ) : null}
        {status === "needs_config" ? (
          <p className="muted api4com-webphone-dock-detail">
            Admin: domínio SIP em Integrações → API4COM. BDR: senha SIP do painel API4COM (instalação do Webphone) em
            Meu perfil ou Usuários.
          </p>
        ) : null}
        <div className="api4com-webphone-dock-actions">
          {!online ? (
            <button type="button" className="btn btn-primary" disabled={connecting} onClick={onConnect}>
              {connecting ? "Conectando…" : "Conectar ramal"}
            </button>
          ) : (
            <span className="api4com-webphone-dock-ok">
              <Phone size={16} aria-hidden />
              Pronto — ligações da API são atendidas automaticamente aqui
            </span>
          )}
          {online ? (
            <button type="button" className="btn" disabled={connecting} onClick={onConnect}>
              <PhoneOff size={16} aria-hidden />
              Reconectar
            </button>
          ) : null}
        </div>
        <div id="api4com-wp-audio" className="api4com-webphone-hidden-host" aria-hidden />
        <div id="api4com-wp-media" className="api4com-webphone-hidden-host" aria-hidden />
      </div>
    </div>
  );
}
