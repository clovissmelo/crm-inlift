"use client";

import clsx from "clsx";
import { Phone, PhoneOff, X } from "lucide-react";
import { useState } from "react";
import { Api4comDialPad } from "@/components/api4com-dial-pad";
import type { WebphoneRegistrationState } from "@/components/api4com-webphone-provider";
import { apiErrorText } from "@/lib/api-error-text";
import { normalizeApi4comCalledNumber } from "@/lib/api4com/phone";

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
  connecting,
  dialUserId,
  onPrepareForDial,
  hasActiveSipCall,
  onHangUp,
  onRecoverFromDialFailure,
  beginDialAssist,
  endDialAssist,
  isMicMuted,
  onToggleMicMuted
}: {
  open: boolean;
  onClose: () => void;
  status: WebphoneRegistrationState;
  statusDetail: string | null;
  extension: string | null;
  targetUserName: string | null;
  onConnect: () => void;
  connecting: boolean;
  dialUserId: number;
  onPrepareForDial: (userId: number) => Promise<boolean>;
  hasActiveSipCall: boolean;
  onHangUp: (callRecordId?: number | null) => Promise<void>;
  onRecoverFromDialFailure: (callRecordId?: number | null) => Promise<void>;
  beginDialAssist: () => void;
  endDialAssist: () => void;
  isMicMuted: boolean;
  onToggleMicMuted: () => void;
}) {
  const [testNumber, setTestNumber] = useState("");
  const [testDialing, setTestDialing] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<string | null>(null);
  const [activeCallRecordId, setActiveCallRecordId] = useState<number | null>(null);
  const [hangingUp, setHangingUp] = useState(false);

  if (!open) return null;

  const online = status === "registered";
  const showHangUp = hasActiveSipCall || activeCallRecordId != null || testDialing;

  async function startTestCall() {
    const normalized = normalizeApi4comCalledNumber(testNumber.trim());
    if (!normalized) {
      setTestError("Número inválido. Use DDD + número (10 ou 11 dígitos), sem repetir o 55.");
      return;
    }
    setTestDialing(true);
    setTestError(null);
    setTestOk(null);
    setActiveCallRecordId(null);
    const ready = await onPrepareForDial(dialUserId);
    if (!ready) {
      setTestDialing(false);
      setTestError("Conecte o ramal antes de ligar.");
      return;
    }
    beginDialAssist();
    let data: unknown = null;
    let res: Response;
    try {
      res = await fetch("/api/api4com/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized })
      });
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    } finally {
      endDialAssist();
    }
    setTestDialing(false);
    if (!res.ok) {
      const failBody = data as { call_record_id?: number };
      await onRecoverFromDialFailure(failBody.call_record_id ?? activeCallRecordId);
      setActiveCallRecordId(null);
      setTestError(apiErrorText(data, "Não foi possível iniciar a ligação."));
      return;
    }
    const body = data as { call_record_id?: number };
    if (body.call_record_id) setActiveCallRecordId(body.call_record_id);
    setTestOk("Ligação iniciada — use Desligar quando terminar.");
  }

  async function hangUpCall() {
    setHangingUp(true);
    setTestError(null);
    try {
      await onHangUp(activeCallRecordId);
      setActiveCallRecordId(null);
      setTestOk(null);
    } finally {
      setHangingUp(false);
      setTestDialing(false);
    }
  }

  return (
    <>
      <button type="button" className="api4com-webphone-backdrop" aria-label="Fechar discador" onClick={onClose} />
      <div className="api4com-webphone-dock api4com-webphone-dock--center" role="dialog" aria-label="Discador API4COM">
        <div className="api4com-webphone-dock-inner panel">
          <div className="api4com-webphone-dock-head">
            <div className="api4com-webphone-dock-title">
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
            <div className="api4com-webphone-dock-intro">
              <p className="api4com-webphone-dock-detail">Conecte o seu ramal para realização de chamadas.</p>
              <p className="api4com-webphone-dock-note muted">
                Feche a extensão Webphone da API4COM no Chrome se estiver aberta.
              </p>
            </div>
          ) : null}
          {status === "needs_config" ? (
            <p className="muted api4com-webphone-dock-detail">
              Admin: domínio SIP em Integrações → API4COM. BDR: senha SIP em Meu telefone ou Usuários.
            </p>
          ) : null}

          <div className="api4com-webphone-dock-actions">
            {!online ? (
              <button type="button" className="btn btn-primary btn-block" disabled={connecting} onClick={onConnect}>
                {connecting ? "Conectando…" : "Conectar ramal"}
              </button>
            ) : null}
            {online ? (
              <button type="button" className="btn btn-ghost btn-sm" disabled={connecting} onClick={onConnect}>
                <PhoneOff size={16} aria-hidden />
                Reconectar
              </button>
            ) : null}
          </div>

          {online ? (
            <div className="api4com-webphone-test-dial">
              <p className="api4com-webphone-test-dial-heading">Discador de chamadas manual</p>
              <Api4comDialPad
                value={testNumber}
                onChange={setTestNumber}
                onDial={() => void startTestCall()}
                dialing={testDialing}
                disabled={hangingUp}
                isMuted={isMicMuted}
                onToggleMute={onToggleMicMuted}
                showHangUp={showHangUp}
                onHangUp={() => void hangUpCall()}
                hangingUp={hangingUp}
              />
              {testError ? <p className="alert alert-error api4com-webphone-test-msg">{testError}</p> : null}
              {testOk ? <p className="api4com-webphone-test-ok api4com-webphone-test-msg">{testOk}</p> : null}
            </div>
          ) : null}

          <div id="api4com-wp-audio" className="api4com-webphone-hidden-host" aria-hidden />
          <div id="api4com-wp-media" className="api4com-webphone-hidden-host" aria-hidden />
        </div>
      </div>
    </>
  );
}
