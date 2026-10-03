"use client";

import { useEffect, useState } from "react";
import { CadastroModal } from "@/components/cadastro-ui";
import type { Product } from "@/lib/types";

function spInputToIso(date: string, time: string) {
  return new Date(`${date}T${time}:00-03:00`).toISOString();
}

export function ScheduleContactModal({
  open,
  onClose,
  clientId,
  clientName,
  products,
  defaultProductId,
  inProspeccao,
  bdrUserId,
  bdrs,
  onSuccess
}: {
  open: boolean;
  onClose: () => void;
  clientId: number;
  clientName: string;
  products: Product[];
  defaultProductId?: number;
  inProspeccao: boolean;
  bdrUserId: number | null;
  bdrs: Array<{ id: number; name: string }>;
  onSuccess?: () => void;
}) {
  const [productId, setProductId] = useState("");
  const [enrollBdrId, setEnrollBdrId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const pid =
      defaultProductId ?? (products.length === 1 ? products[0].id : products.length > 0 ? products[0].id : null);
    setProductId(pid != null ? String(pid) : "");
    setEnrollBdrId(bdrUserId != null ? String(bdrUserId) : bdrs[0] ? String(bdrs[0].id) : "");
    setDate("");
    setTime("");
    setNotes("");
    setError(null);
  }, [open, defaultProductId, products, bdrUserId, bdrs]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!date.trim() || !time.trim()) {
      setError("Informe data e hora do contato.");
      return;
    }
    if (!inProspeccao) {
      if (!productId) {
        setError("Selecione o produto para colocar o lead em prospecção.");
        return;
      }
      if (!enrollBdrId) {
        setError("Selecione o BDR responsável.");
        return;
      }
    }

    setLoading(true);
    try {
      if (!inProspeccao) {
        const enrollRes = await fetch(`/api/clients/${clientId}/prospeccao-queue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: Number(productId),
            bdr_user_id: Number(enrollBdrId)
          })
        });
        if (!enrollRes.ok) {
          const data = (await enrollRes.json()) as { error?: string };
          setError(data.error ?? "Não foi possível colocar em prospecção.");
          return;
        }
      }

      const res = await fetch("/api/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          product_id: productId ? Number(productId) : null,
          scheduled_at: spInputToIso(date, time),
          kind: "return",
          notes: notes.trim() || null
        })
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Erro ao agendar contato.");
        return;
      }
      onSuccess?.();
      onClose();
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <CadastroModal open={open} title={`Agendar contato — ${clientName}`} onClose={onClose}>
      <form onSubmit={submit}>
        {error ? <div className="alert alert-error">{error}</div> : null}
        <p className="muted" style={{ fontSize: "0.875rem", marginTop: 0 }}>
          O lead {inProspeccao ? "permanece" : "passará a ficar"} na prospecção como{" "}
          <strong>Agendado</strong> até a data. No vencimento, volta à fila para ligação.
        </p>
        {!inProspeccao ? (
          <>
            <div className="field">
              <label className="label">Produto *</label>
              <select className="select" value={productId} onChange={(e) => setProductId(e.target.value)} required>
                <option value="">Selecione…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">BDR *</label>
              <select className="select" value={enrollBdrId} onChange={(e) => setEnrollBdrId(e.target.value)} required>
                <option value="">Selecione…</option>
                {bdrs.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : products.length > 1 ? (
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
        ) : null}
        <div className="field">
          <label className="label">Data e hora *</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <label className="label">Observação</label>
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Salvando…" : "Confirmar agendamento"}
          </button>
        </div>
      </form>
    </CadastroModal>
  );
}
