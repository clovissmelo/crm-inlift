"use client";

import clsx from "clsx";
import { Phone, PhoneOff, X } from "lucide-react";
import { useState } from "react";
import type { WebphoneRegistrationState } from "@/components/api4com-webphone-provider";
import { apiErrorText } from "@/lib/api-error-text";

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
  onRecoverFromDialFailure
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
    const phone = testNumber.trim();
    if (!phone) {
      setTestError("Informe o número para ligação.");
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
    const res = await fetch("/api/api4com/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone })
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
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
            <p className="muted api4com-webphone-dock-detail">
              Feche a extensão Webphone da API4COM no Chrome — só uma conexão SIP por ramal.
            </p>
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
              <label className="api4com-webphone-test-dial-label" htmlFor="api4com-manual-dial-input">
                Digite o número para ligação:
              </label>
              <div className="api4com-webphone-test-dial-row">
                <input
                  id="api4com-manual-dial-input"
                  type="tel"
                  className="input"
                  placeholder="(51) 99999-9999"
                  value={testNumber}
                  onChange={(e) => setTestNumber(e.target.value)}
                  disabled={testDialing || hangingUp}
                  autoComplete="tel"
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={testDialing || hangingUp || !testNumber.trim()}
                  onClick={() => void startTestCall()}
                >
                  {testDialing ? "Discando…" : "Ligar"}
                </button>
              </div>
              {showHangUp ? (
                <button
                  type="button"
                  className="btn btn-danger btn-block api4com-webphone-hangup-btn"
                  disabled={hangingUp}
                  onClick={() => void hangUpCall()}
                >
                  {hangingUp ? "Desligando…" : "Desligar ligação"}
                </button>
              ) : null}
              {testError ? <p className="alert alert-error api4com-webphone-test-msg">{testError}</p> : null}
              {testOk ? <p className="api4com-webphone-test-ok api4com-webphone-test-msg">{testOk}</p> : null}
              <p className="muted api4com-webphone-dock-detail">
                Em caso de erro, o ramal é desconectado automaticamente para parar o toque.
              </p>
            </div>
          ) : null}

          <div id="api4com-wp-audio" className="api4com-webphone-hidden-host" aria-hidden />
          <div id="api4com-wp-media" className="api4com-webphone-hidden-host" aria-hidden />
        </div>
      </div>
    </>
  );
}
