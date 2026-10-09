"use client";

import clsx from "clsx";
import "./call-script-guide.css";
import { Phone } from "lucide-react";
import { useState } from "react";
import { Api4comDialPad } from "@/components/api4com-dial-pad";
import { useApi4comWebphone, type WebphoneRegistrationState } from "@/components/api4com-webphone-provider";
import { callScriptStatusLabel } from "@/components/call-script-guide-panel";

const STATUS_LABEL: Record<WebphoneRegistrationState, string> = {
  idle: "Desconectado",
  loading: "Carregando discador…",
  connecting: "Conectando ramal…",
  registered: "Ramal online",
  error: "Erro na telefonia",
  needs_config: "Configuração pendente"
};

function crmCallIsLive(status: string) {
  return status === "initiating" || status === "ringing" || status === "in_progress";
}

export function Api4comWebphoneCompanionPanel({
  callRecordId,
  callStatus
}: {
  callRecordId: number;
  callStatus: string;
}) {
  const webphone = useApi4comWebphone();
  const [padValue, setPadValue] = useState("");
  const [hangingUp, setHangingUp] = useState(false);

  if (!webphone) return null;

  const { status, registeredExtension, hasActiveSipCall, isMicMuted, toggleMicrophoneMuted, sendDtmfDigit } =
    webphone;
  const online = status === "registered";
  const liveCall = crmCallIsLive(callStatus) || hasActiveSipCall;
  const showHangUp = liveCall;

  async function hangUp() {
    setHangingUp(true);
    try {
      await webphone.hangUpSipAndApiCall(callRecordId);
      setPadValue("");
    } finally {
      setHangingUp(false);
    }
  }

  return (
    <aside className="call-webphone-companion" aria-label="Telefone CRM durante a ligação">
      <header className="call-webphone-companion-head">
        <div className="call-webphone-companion-title">
          <Phone size={18} aria-hidden />
          <span>Telefone CRM</span>
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
      </header>
      <div className="call-webphone-companion-body">
        <p className="api4com-webphone-dock-status" style={{ marginTop: 0 }}>
          <strong>{STATUS_LABEL[status]}</strong>
          {registeredExtension ? (
            <>
              {" "}
              · ramal <code>{registeredExtension}</code>
            </>
          ) : null}
        </p>
        <p className="muted" style={{ fontSize: "0.8125rem", margin: "0 0 10px" }}>
          CRM: <strong>{callScriptStatusLabel(callStatus)}</strong>
        </p>
        {liveCall ? (
          <div className="api4com-webphone-active-call" role="status">
            Ligação ativa
          </div>
        ) : null}
        {!online ? (
          <p className="muted api4com-webphone-dock-detail">
            Conecte o ramal pelo ícone de telefone no topo ou abra o discador completo.
          </p>
        ) : (
          <div className="api4com-webphone-test-dial" style={{ marginTop: 12 }}>
            <p className="api4com-webphone-test-dial-heading">
              {liveCall ? "Teclado (DTMF)" : "Discador"}
            </p>
            <Api4comDialPad
              value={padValue}
              onChange={setPadValue}
              onDial={() => {}}
              dialing={false}
              disabled={!online || hangingUp}
              isMuted={isMicMuted}
              onToggleMute={toggleMicrophoneMuted}
              showHangUp={showHangUp}
              onHangUp={() => void hangUp()}
              hangingUp={hangingUp}
              hideDialButton={liveCall}
              onPadDigit={liveCall ? (d) => sendDtmfDigit(d) : undefined}
            />
          </div>
        )}
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={webphone.openPanel}>
          Abrir discador completo
        </button>
      </div>
    </aside>
  );
}
