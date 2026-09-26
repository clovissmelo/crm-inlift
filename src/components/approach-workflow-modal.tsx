"use client";

import { useEffect, useState } from "react";
import { CadastroModal } from "@/components/cadastro-ui";
import type { Product } from "@/lib/types";
import type { ClientContact } from "@/components/client-detail-view";

type ResultType = { id: number; name: string; suggest_follow_up: boolean; collect_notes?: boolean };
type ClosureReason = { id: number; name: string; kind: "pause" | "close" };

function spInputToIso(date: string, time: string) {
  if (!date || !time) return new Date().toISOString();
  return new Date(`${date}T${time}:00-03:00`).toISOString();
}

export function ApproachWorkflowModal({
  open,
  onClose,
  clientId,
  clientName,
  contacts,
  products,
  defaultChannel,
  defaultContactId,
  defaultProductId,
  followUpId
}: {
  open: boolean;
  onClose: () => void;
  clientId: number;
  clientName: string;
  contacts: ClientContact[];
  products: Product[];
  defaultChannel: "call" | "whatsapp" | "email";
  defaultContactId?: number;
  defaultProductId?: number;
  followUpId?: number;
}) {
  const [resultTypes, setResultTypes] = useState<ResultType[]>([]);
  const [closureReasons, setClosureReasons] = useState<ClosureReason[]>([]);
  const [channel, setChannel] = useState(defaultChannel);
  const [contactId, setContactId] = useState<string>(defaultContactId ? String(defaultContactId) : "");
  const [productId, setProductId] = useState<string>(defaultProductId ? String(defaultProductId) : "");
  const [resultTypeId, setResultTypeId] = useState("");
  const [notes, setNotes] = useState("");
  const [usePast, setUsePast] = useState(false);
  const [pastDate, setPastDate] = useState("");
  const [pastTime, setPastTime] = useState("");
  const [nextType, setNextType] = useState<"none" | "schedule_return" | "schedule_meeting" | "pause" | "close">("none");
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("");
  const [nextNotes, setNextNotes] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChannel(defaultChannel);
    setContactId(defaultContactId ? String(defaultContactId) : "");
    setProductId(defaultProductId ? String(defaultProductId) : "");
    void (async () => {
      const [rt, cr] = await Promise.all([
        fetch("/api/approach-result-types").then((r) => r.json()),
        fetch("/api/closure-reason-types").then((r) => r.json())
      ]);
      setResultTypes(
        (rt as { items: Array<ResultType & { status?: string }> }).items.filter(
          (i) => i.id && (!i.status || i.status === "active")
        )
      );
      setClosureReasons((cr as { items: ClosureReason[] }).items);
    })();
  }, [open, defaultChannel, defaultContactId, defaultProductId]);

  const selectedResult = resultTypes.find((r) => String(r.id) === resultTypeId);
  const showNotesField = selectedResult?.collect_notes !== false;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    let next_action: Record<string, unknown> = { type: "none" };
    if (nextType === "schedule_return" || nextType === "schedule_meeting") {
      next_action = {
        type: nextType,
        scheduled_at: spInputToIso(nextDate, nextTime),
        contact_id: contactId ? Number(contactId) : null,
        product_id: productId ? Number(productId) : null,
        notes: nextNotes || null
      };
    } else if (nextType === "pause" || nextType === "close") {
      if (!productId || !reasonId) {
        setError("Informe produto e motivo.");
        setLoading(false);
        return;
      }
      next_action = { type: nextType, product_id: Number(productId), reason_id: Number(reasonId) };
    }

    const res = await fetch("/api/approaches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        contact_id: contactId ? Number(contactId) : null,
        product_id: productId ? Number(productId) : null,
        channel,
        occurred_at: usePast ? spInputToIso(pastDate, pastTime) : null,
        result_type_id: Number(resultTypeId),
        notes: notes || null,
        follow_up_id: followUpId,
        next_action
      })
    });
    const data = (await res.json()) as { error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Erro ao registrar");
      return;
    }
    onClose();
    window.location.reload();
  }

  if (!open) return null;

  return (
    <CadastroModal open={open} title={`Registrar abordagem — ${clientName}`} onClose={onClose} wide>
      <form onSubmit={submit}>
        {error ? <div className="alert alert-error">{error}</div> : null}
        <div className="filters-row">
          <div className="field">
            <label className="label">Canal</label>
            <select className="select" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
              <option value="call">Ligação</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">E-mail</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Contato</label>
            <select className="select" value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">—</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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
        </div>
        <div className="field">
          <label className="label">Resultado</label>
          <select className="select" value={resultTypeId} onChange={(e) => setResultTypeId(e.target.value)} required>
            <option value="">Selecione</option>
            {resultTypes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        {showNotesField ? (
          <div className="field">
            <label className="label">Observações</label>
            <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        ) : null}
        <label style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input type="checkbox" checked={usePast} onChange={(e) => setUsePast(e.target.checked)} />
          Abordagem ocorreu fora do Funon (data anterior)
        </label>
        {usePast ? (
          <div className="filters-row">
            <div className="field">
              <label className="label">Data</label>
              <input className="input" type="date" value={pastDate} onChange={(e) => setPastDate(e.target.value)} required={usePast} />
            </div>
            <div className="field">
              <label className="label">Horário</label>
              <input className="input" type="time" value={pastTime} onChange={(e) => setPastTime(e.target.value)} required={usePast} />
            </div>
          </div>
        ) : null}

        <h4>Próxima ação</h4>
        {selectedResult?.suggest_follow_up ? (
          <p className="muted">Este resultado sugere definir um próximo passo.</p>
        ) : null}
        <div className="field">
          <select className="select" value={nextType} onChange={(e) => setNextType(e.target.value as typeof nextType)}>
            <option value="none">Nenhuma</option>
            <option value="schedule_return">Agendar retorno</option>
            <option value="schedule_meeting">Agendar reunião</option>
            <option value="pause">Pausar</option>
            <option value="close">Encerrar</option>
          </select>
        </div>
        {nextType === "schedule_return" || nextType === "schedule_meeting" ? (
          <>
            <div className="filters-row">
              <div className="field">
                <label className="label">Data</label>
                <input className="input" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} required />
              </div>
              <div className="field">
                <label className="label">Horário</label>
                <input className="input" type="time" value={nextTime} onChange={(e) => setNextTime(e.target.value)} required />
              </div>
            </div>
            <div className="field">
              <label className="label">Motivo / observação</label>
              <textarea className="textarea" value={nextNotes} onChange={(e) => setNextNotes(e.target.value)} />
            </div>
          </>
        ) : null}
        {nextType === "pause" || nextType === "close" ? (
          <div className="field">
            <label className="label">Motivo</label>
            <select className="select" value={reasonId} onChange={(e) => setReasonId(e.target.value)} required>
              <option value="">Selecione</option>
              {closureReasons
                .filter((r) => r.kind === (nextType === "pause" ? "pause" : "close"))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            Salvar abordagem
          </button>
          <button className="btn" type="button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </CadastroModal>
  );
}
