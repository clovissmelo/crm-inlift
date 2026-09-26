"use client";

import { useEffect, useState } from "react";
import { CadastroModal } from "@/components/cadastro-ui";
import { LEAD_QUALIFICATION_LABELS, LEAD_QUALIFICATION_ORDER, type LeadQualification } from "@/lib/lead-qualification";
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

type ResultType = { id: number; name: string; suggest_follow_up: boolean };

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
  const [call, setCall] = useState<CallDetail | null>(null);
  const [resultTypes, setResultTypes] = useState<ResultType[]>([]);
  const [resultTypeId, setResultTypeId] = useState("");
  const [productId, setProductId] = useState("");
  const [phoneConfirm, setPhoneConfirm] = useState("");
  const [notes, setNotes] = useState("");
  const [leadQualification, setLeadQualification] = useState<LeadQualification | "">("");
  const [nextType, setNextType] = useState<"none" | "schedule_return">("none");
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !callId) return;
    setError(null);
    void (async () => {
      const [callRes, rtRes] = await Promise.all([
        fetch(`/api/api4com/calls/${callId}`),
        fetch("/api/approach-result-types")
      ]);
      const callData = (await callRes.json()) as { call?: CallDetail; error?: string };
      if (!callRes.ok || !callData.call) {
        setError(callData.error ?? "Chamada não encontrada");
        return;
      }
      setCall(callData.call);
      setPhoneConfirm(callData.call.phone_dialed);
      setProductId(callData.call.product_id ? String(callData.call.product_id) : "");
      const rt = (await rtRes.json()) as { items: Array<ResultType & { status?: string }> };
      setResultTypes(rt.items.filter((i) => i.id && (!i.status || i.status === "active")));
    })();
  }, [open, callId]);

  async function deferLater() {
    if (!callId) return;
    await fetch(`/api/api4com/calls/${callId}/defer`, { method: "POST" });
    onClose();
    onCompleted();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!call || !call.client_id || !resultTypeId) {
      setError("Selecione o resultado comercial.");
      return;
    }
    const selectedResult = resultTypes.find((r) => String(r.id) === resultTypeId);
    if (selectedResult?.suggest_follow_up && nextType === "none") {
      setError("Este resultado sugere agendar retorno ou outra próxima ação.");
      return;
    }
    setLoading(true);
    setError(null);

    let finalNotes = notes.trim();
    if (phoneConfirm.trim() && phoneConfirm.trim() !== call.phone_dialed) {
      finalNotes = [`Número confirmado: ${phoneConfirm.trim()}`, finalNotes].filter(Boolean).join("\n");
    }

    let next_action: Record<string, unknown> = { type: "none" };
    if (nextType === "schedule_return") {
      if (!nextDate || !nextTime) {
        setError("Informe data e hora do retorno.");
        setLoading(false);
        return;
      }
      next_action = {
        type: "schedule_return",
        scheduled_at: spInputToIso(nextDate, nextTime),
        contact_id: call.contact_id,
        product_id: productId ? Number(productId) : null,
        notes: null
      };
    }

    const res = await fetch("/api/approaches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: call.client_id,
        contact_id: call.contact_id,
        product_id: productId ? Number(productId) : null,
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

    if (leadQualification) {
      await fetch(`/api/clients/${call.client_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_qualification: leadQualification })
      });
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

  return (
    <CadastroModal open={open} title="Registrar resultado da ligação" onClose={onClose}>
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
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Produto</label>
          <select className="select" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">—</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Qualificação do lead</label>
          <select className="select" value={leadQualification} onChange={(e) => setLeadQualification(e.target.value as LeadQualification | "")}>
            <option value="">Manter atual</option>
            {LEAD_QUALIFICATION_ORDER.map((q) => (
              <option key={q} value={q}>
                {LEAD_QUALIFICATION_LABELS[q]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Observações</label>
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="field">
          <label className="label">Próximo passo</label>
          <select className="select" value={nextType} onChange={(e) => setNextType(e.target.value as "none" | "schedule_return")}>
            <option value="none">Nenhum</option>
            <option value="schedule_return">Agendar retorno</option>
          </select>
        </div>
        {nextType === "schedule_return" ? (
          <div style={{ display: "flex", gap: 8 }}>
            <input className="input" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} required />
            <input className="input" type="time" value={nextTime} onChange={(e) => setNextTime(e.target.value)} required />
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
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
    </CadastroModal>
  );
}
