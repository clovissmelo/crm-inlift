"use client";

import { useEffect, useState } from "react";
import { formatSpDateTime } from "@/lib/datetime";
import { formatPhoneDisplay } from "@/lib/format";
import {
  formatAttemptProgress,
  formatPhoneDialSituation
} from "@/lib/call-strategy/phone-dial-status";

type StrategyPhone = {
  client_phone_id: number;
  phone_display: string;
  position: number;
  total: number;
  status: string;
  cycle_no_contact_count?: number;
  counter_line: string | null;
  counter_lines: string[];
  needs_review: boolean;
  next_eligible_at: string | null;
  eligible_now: boolean;
};

type DialContextSlice = {
  call: {
    technical_display_name?: string | null;
    technical_slug?: string | null;
    product_id: number | null;
  };
  call_strategy?: {
    phones: StrategyPhone[];
    current?: StrategyPhone | null;
  } | null;
  current_phone?: StrategyPhone | null;
};

type Props = {
  callId: number;
  maxNoContact?: number;
  compact?: boolean;
};

export function CallDialContextBanner({ callId, maxNoContact = 3, compact }: Props) {
  const [ctx, setCtx] = useState<DialContextSlice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/api4com/calls/${callId}/dial-context`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled) setCtx(j as DialContextSlice | null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [callId]);

  const phone = ctx?.current_phone ?? ctx?.call_strategy?.phones?.[0] ?? null;
  const technical =
    ctx?.call.technical_display_name ??
    (ctx?.call.technical_slug ? ctx.call.technical_slug.replace(/_/g, " ") : "Aguardando telefonia");

  if (loading) return <p className="muted" style={{ fontSize: "0.8125rem", margin: 0 }}>Carregando telefonia…</p>;

  return (
    <div
      className="panel"
      style={{ padding: compact ? 8 : 10, marginBottom: compact ? 8 : 12, fontSize: "0.8125rem" }}
    >
      <div>
        <strong>Resultado automático:</strong> {technical}
      </div>
      {phone ? (
        <>
          <div style={{ marginTop: 4 }}>
            <strong>{formatPhoneDisplay(phone.phone_display)}</strong>
            {" · "}
            {formatPhoneDialSituation({
              status: phone.status,
              needs_review: phone.needs_review,
              next_eligible_at: phone.next_eligible_at
            })}
          </div>
          <div className="muted" style={{ marginTop: 2 }}>
            {formatAttemptProgress({
              cycle_no_contact_count: phone.cycle_no_contact_count ?? 0,
              max_no_contact_attempts: maxNoContact,
              position: phone.position,
              total: phone.total
            })}
            {phone.counter_line ? ` · ${phone.counter_line}` : ""}
          </div>
          {phone.next_eligible_at && phone.status === "waiting" ? (
            <div className="muted">Próxima tentativa: {formatSpDateTime(phone.next_eligible_at)}</div>
          ) : null}
        </>
      ) : (
        <div className="muted" style={{ marginTop: 4 }}>
          Sem telefone sincronizado para estratégia de discagem.
        </div>
      )}
    </div>
  );
}
