"use client";

import { Headphones } from "lucide-react";
import { callTelephonyResultLabel } from "@/lib/api4com/call-registration";
import { formatSpDateTime } from "@/lib/datetime";
import { formatPhoneDisplay } from "@/lib/format";

export function CallRegistrationHeader({
  clientName,
  contactName,
  productName,
  phoneDialed,
  endedAt,
  durationLabel,
  callAnswered,
  technicalSlug,
  technicalLabel,
  hangupCauseLabel,
  recordUrl,
  callId,
  hideRecording,
  lastAttemptAt,
  lastAttemptBucket,
  waitingNextAt
}: {
  clientName: string | null;
  contactName: string | null;
  productName: string | null;
  phoneDialed: string;
  endedAt: string | null;
  durationLabel: string;
  callAnswered: boolean;
  technicalSlug?: string | null;
  technicalLabel: string;
  hangupCauseLabel: string | null;
  recordUrl: string | null;
  callId: number;
  hideRecording?: boolean;
  lastAttemptAt?: string | null;
  lastAttemptBucket?: string | null;
  waitingNextAt?: string | null;
}) {
  const telephonyResult =
    callTelephonyResultLabel(technicalSlug, technicalLabel) ||
    (callAnswered ? "Atendeu" : "Chamou e não atendeu");
  const causePart = hangupCauseLabel ? ` (${hangupCauseLabel})` : "";

  return (
    <header className="call-reg-complement-header">
      <div className="call-reg-header-block call-reg-header-block--identity">
        <p className="call-reg-header-title">
          {clientName ?? "Cliente"}
          {contactName ? ` · ${contactName}` : null}
        </p>
        {productName ? (
          <p className="call-reg-header-line">
            Produto: <strong className="call-reg-header-strong">{productName}</strong>
          </p>
        ) : null}
      </div>

      <hr className="call-reg-divider" />

      <div className="call-reg-header-block call-reg-header-block--call">
        <p className="call-reg-header-line">
          {formatPhoneDisplay(phoneDialed)} · {endedAt ? formatSpDateTime(endedAt) : "—"}
        </p>
        <p className="call-reg-header-line">
          {telephonyResult}
          {causePart} · Duração {durationLabel}
        </p>
        {recordUrl && !hideRecording ? (
          <p className="call-reg-header-line call-reg-header-recording">
            <Headphones size={15} aria-hidden style={{ flexShrink: 0, opacity: 0.85 }} />
            <a href={`/api/api4com/calls/${callId}/recording`} target="_blank" rel="noreferrer">
              Ouvir gravação
            </a>
          </p>
        ) : null}
        {lastAttemptAt ? (
          <p className="call-reg-header-line call-reg-header-line--meta">
            Última tentativa: {formatSpDateTime(lastAttemptAt)}
            {lastAttemptBucket ? ` (${lastAttemptBucket})` : ""}
          </p>
        ) : null}
        {waitingNextAt ? (
          <p className="call-reg-header-line call-reg-header-line--meta">
            Aguardando próxima tentativa — elegível a partir de {formatSpDateTime(waitingNextAt)}.
          </p>
        ) : null}
      </div>

      <hr className="call-reg-divider" />
    </header>
  );
}
