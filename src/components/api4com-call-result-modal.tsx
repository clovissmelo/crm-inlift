"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CadastroModal } from "@/components/cadastro-ui";
import { LEAD_QUALIFICATION_LABELS, type LeadQualification } from "@/lib/lead-qualification";
import { formatSpDateTime } from "@/lib/datetime";
import type { Product } from "@/lib/types";
import { formatPhoneDisplay } from "@/lib/format";

type CallDetail = {
  id: number;
  api4com_call_id: string | null;
  client_id: number | null;
  contact_id: number | null;
  product_id: number | null;
  phone_dialed: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  hangup_cause_label: string | null;
  client_name: string | null;
  contact_name: string | null;
  record_url: string | null;
};

type ResultType = {
  id: number;
  name: string;
  suggest_follow_up: boolean;
  lead_qualification: LeadQualification | null;
};

type DialOption = {
  contact_id: number;
  contact_name: string | null;
  phone: string;
  phone_display: string;
  kind: "phone" | "whatsapp";
};

type DialContext = {
  call: CallDetail;
  session_root_id: number;
  remaining: DialOption[];
  skipped: Array<{ contact_id: number | null; phone: string; created_at: string }>;
  session_calls: Array<{
    id: number;
    contact_id: number | null;
    phone_dialed: string;
    ended_at: string | null;
    duration_seconds: number | null;
  }>;
  client_product_ids: number[];
};

function spInputToIso(date: string, time: string) {
  return new Date(`${date}T${time}:00-03:00`).toISOString();
}

export function Api4comCallResultModal({
  callId,
  open,
  onClose,
  onCompleted,
  products
}: {
  callId: number | null;
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
  products: Product[];
}) {
  const [ctx, setCtx] = useState<DialContext | null>(null);
  const [step, setStep] = useState<"next_dial" | "result">("result");
  const [resultTypes, setResultTypes] = useState<ResultType[]>([]);
  const [resultTypeId, setResultTypeId] = useState("");
  const [productId, setProductId] = useState("");
  const [phoneConfirm, setPhoneConfirm] = useState("");
  const [notes, setNotes] = useState("");
  const [nextType, setNextType] = useState<"none" | "schedule_return" | "schedule_meeting">("none");
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [dialLoading, setDialLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = ctx?.call ?? null;

  const productChoices = useMemo(() => {
    const ids = ctx?.client_product_ids ?? [];
    if (ids.length === 0) return products;
    const set = new Set(ids);
    return products.filter((p) => set.has(p.id));
  }, [ctx?.client_product_ids, products]);

  const singleClientProductId =
    ctx && ctx.client_product_ids.length === 1 ? String(ctx.client_product_ids[0]) : null;

  const showProductField = !singleClientProductId;

  const loadContext = useCallback(async () => {
    if (!callId) return;
    setError(null);
    const [ctxRes, rtRes] = await Promise.all([
      fetch(`/api/api4com/calls/${callId}/dial-context`),
      fetch("/api/approach-result-types")
    ]);
    const ctxData = (await ctxRes.json()) as DialContext & { error?: string };
    if (!ctxRes.ok || !ctxData.call) {
      setError(ctxData.error ?? "Chamada não encontrada");
      setCtx(null);
      return;
    }
    setCtx(ctxData);
    setPhoneConfirm(ctxData.call.phone_dialed);
    const autoProduct =
      ctxData.call.product_id != null
        ? String(ctxData.call.product_id)
        : ctxData.client_product_ids.length === 1
          ? String(ctxData.client_product_ids[0])
          : "";
    setProductId(autoProduct);

    const rt = (await rtRes.json()) as {
      items: Array<ResultType & { status?: string; lead_qualification?: string | null }>;
    };
    setResultTypes(
      rt.items
        .filter((i) => i.id && (!i.status || i.status === "active"))
        .map((i) => ({
          id: i.id,
          name: i.name,
          suggest_follow_up: i.suggest_follow_up,
          lead_qualification:
            i.lead_qualification === "warm" || i.lead_qualification === "hot" || i.lead_qualification === "cold"
              ? i.lead_qualification
              : null
        }))
    );

    setStep(ctxData.remaining.length > 0 ? "next_dial" : "result");
  }, [callId]);

  useEffect(() => {
    if (!open || !callId) return;
    setResultTypeId("");
    setNotes("");
    setNextType("none");
    setNextDate("");
    setNextTime("");
    void loadContext();
  }, [open, callId, loadContext]);

  const selectedResult = resultTypes.find((r) => String(r.id) === resultTypeId);
  const nextDial = ctx?.remaining[0] ?? null;

  async function deferLater() {
    if (!callId) return;
    await fetch(`/api/api4com/calls/${callId}/defer`, { method: "POST" });
    onClose();
    onCompleted();
  }

  async function skipNextDial() {
    if (!callId || !nextDial || !call?.client_id) return;
    setDialLoading(true);
    setError(null);
    const res = await fetch(`/api/api4com/calls/${callId}/dial-skip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: nextDial.contact_id, phone: nextDial.phone })
    });
    setDialLoading(false);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Erro ao registrar");
      return;
    }
    await loadContext();
  }

  async function dialNext() {
    if (!callId || !nextDial || !call?.client_id || !ctx) return;
    setDialLoading(true);
    setError(null);
    const res = await fetch("/api/api4com/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: call.client_id,
        contact_id: nextDial.contact_id,
        product_id: productId ? Number(productId) : call.product_id,
        phone: nextDial.phone,
        dial_session_root_id: ctx.session_root_id
      })
    });
    setDialLoading(false);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Erro ao discar");
      return;
    }
    onClose();
    onCompleted();
  }

  function buildSessionNotes() {
    if (!ctx) return notes.trim();
    const lines: string[] = [];
    if (ctx.skipped.length > 0) {
      lines.push(
        "Números pulados nesta sessão:",
        ...ctx.skipped.map((s) => `· ${formatPhoneDisplay(s.phone)} (pulado)`)
      );
    }
    if (ctx.session_calls.length > 1) {
      lines.push(
        "Ligações nesta sessão:",
        ...ctx.session_calls.map(
          (c) =>
            `· ${formatPhoneDisplay(c.phone_dialed)}${
              c.duration_seconds != null ? ` (${Math.floor(c.duration_seconds / 60)}:${String(c.duration_seconds % 60).padStart(2, "0")})` : ""
            }`
        )
      );
    }
    const base = notes.trim();
    if (lines.length === 0) return base;
    return [base, lines.join("\n")].filter(Boolean).join("\n\n");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!call || !call.client_id || !resultTypeId) {
      setError("Selecione o resultado comercial.");
      return;
    }
    if (selectedResult?.suggest_follow_up && nextType === "none") {
      setError("Este resultado sugere agendar retorno, reunião ou outra próxima ação.");
      return;
    }
    setLoading(true);
    setError(null);

    let finalNotes = buildSessionNotes();
    if (phoneConfirm.trim() && phoneConfirm.trim() !== call.phone_dialed) {
      finalNotes = [`Número confirmado: ${phoneConfirm.trim()}`, finalNotes].filter(Boolean).join("\n");
    }

    const resolvedProductId = singleClientProductId ?? (productId ? Number(productId) : null);

    let next_action: Record<string, unknown> = { type: "none" };
    if (nextType === "schedule_return" || nextType === "schedule_meeting") {
      if (!nextDate || !nextTime) {
        setError("Informe data e hora.");
        setLoading(false);
        return;
      }
      next_action = {
        type: nextType,
        scheduled_at: spInputToIso(nextDate, nextTime),
        contact_id: call.contact_id,
        product_id: resolvedProductId,
        notes: null
      };
    }

    const res = await fetch("/api/approaches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: call.client_id,
        contact_id: call.contact_id,
        product_id: resolvedProductId,
        channel: "call",
        occurred_at: call.ended_at ?? call.started_at,
        result_type_id: Number(resultTypeId),
        notes: finalNotes || null,
        external_call_id: call.api4com_call_id,
        next_action
      })
    });
    const data = (await res.json()) as { id?: number; error?: string };
    if (!res.ok) {
      setLoading(false);
      setError(data.error ?? "Erro ao registrar abordagem");
      return;
    }

    if (data.id) {
      await fetch(`/api/api4com/calls/${call.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approach_id: data.id })
      });
    }

    setLoading(false);
    onClose();
    onCompleted();
  }

  const duration =
    call?.duration_seconds != null
      ? `${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, "0")}`
      : "—";

  const modalTitle =
    step === "next_dial" ? "Ligar para outro contato?" : "Registrar resultado da ligação";

  return (
    <CadastroModal open={open} title={modalTitle} onClose={onClose}>
      {call ? (
        <div className="muted" style={{ fontSize: "0.8125rem", marginBottom: 12 }}>
          <p style={{ margin: "0 0 4px" }}>
            <strong>{call.client_name ?? "Cliente"}</strong>
            {call.contact_name ? ` · ${call.contact_name}` : null}
          </p>
          <p style={{ margin: 0 }}>
            {formatPhoneDisplay(call.phone_dialed)} · {call.ended_at ? formatSpDateTime(call.ended_at) : "—"} · duração {duration}
            {call.hangup_cause_label ? ` · ${call.hangup_cause_label}` : null}
          </p>
          {call.record_url ? (
            <p style={{ margin: "6px 0 0" }}>
              <a href={`/api/api4com/calls/${call.id}/recording`} target="_blank" rel="noreferrer">
                Ouvir gravação
              </a>
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      {step === "next_dial" && nextDial ? (
        <div>
          <p style={{ marginTop: 0 }}>
            Há outro número disponível para este lead. Você pode ligar agora, pular (fica registrado) ou ir direto ao resultado
            comercial.
          </p>
          <div className="panel" style={{ padding: 12, marginBottom: 12 }}>
            <strong>{nextDial.contact_name ?? "Contato"}</strong>
            <div>{formatPhoneDisplay(nextDial.phone_display || nextDial.phone)}</div>
            <div className="muted" style={{ fontSize: "0.75rem" }}>
              {nextDial.kind === "whatsapp" ? "WhatsApp / alternativo" : "Telefone"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" className="btn" onClick={() => void deferLater()}>
              Preencher depois
            </button>
            <button type="button" className="btn" disabled={dialLoading} onClick={() => void skipNextDial()}>
              Pular este número
            </button>
            <button type="button" className="btn" disabled={dialLoading} onClick={() => setStep("result")}>
              Registrar resultado
            </button>
            <button type="button" className="btn btn-primary" disabled={dialLoading} onClick={() => void dialNext()}>
              {dialLoading ? "Discando…" : "Ligar agora"}
            </button>
          </div>
        </div>
      ) : null}

      {step === "result" ? (
        <form onSubmit={submit}>
          <div className="field">
            <label className="label">Telefone (confirmar ou corrigir)</label>
            <input className="input" value={phoneConfirm} onChange={(e) => setPhoneConfirm(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Resultado comercial *</label>
            <select className="select" value={resultTypeId} onChange={(e) => setResultTypeId(e.target.value)} required>
              <option value="">Selecione…</option>
              {resultTypes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.lead_qualification ? ` · ${LEAD_QUALIFICATION_LABELS[r.lead_qualification]}` : ""}
                </option>
              ))}
            </select>
            {selectedResult?.lead_qualification ? (
              <p className="muted" style={{ fontSize: "0.75rem", margin: "6px 0 0" }}>
                Qualificação do lead será definida automaticamente como{" "}
                <strong>{LEAD_QUALIFICATION_LABELS[selectedResult.lead_qualification]}</strong>.
                {selectedResult.lead_qualification === "cold"
                  ? " Leads frios saem da fila de prospecção após salvar."
                  : " Leads mornos e quentes permanecem no funil e na prospecção."}
              </p>
            ) : null}
          </div>
          {showProductField ? (
            <div className="field">
              <label className="label">Produto</label>
              <select className="select" value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">—</option>
                {productChoices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="field">
            <label className="label">Observações</label>
            <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Próximo passo</label>
            <select
              className="select"
              value={nextType}
              onChange={(e) => setNextType(e.target.value as "none" | "schedule_return" | "schedule_meeting")}
            >
              <option value="none">Nenhum</option>
              <option value="schedule_return">Agendar retorno</option>
              <option value="schedule_meeting">Agendar reunião</option>
            </select>
          </div>
          {nextType === "schedule_return" || nextType === "schedule_meeting" ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input className="input" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} required />
              <input className="input" type="time" value={nextTime} onChange={(e) => setNextTime(e.target.value)} required />
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
            {ctx && ctx.remaining.length > 0 ? (
              <button type="button" className="btn" onClick={() => setStep("next_dial")}>
                Voltar: outros números
              </button>
            ) : null}
            <button type="button" className="btn" onClick={() => void deferLater()}>
              Preencher depois
            </button>
            <button type="button" className="btn" onClick={onClose}>
              Fechar
            </button>
            <button className="btn btn-primary" type="submit" disabled={loading || !call?.client_id}>
              {loading ? "Salvando…" : "Salvar resultado"}
            </button>
          </div>
        </form>
      ) : null}
    </CadastroModal>
  );
}
