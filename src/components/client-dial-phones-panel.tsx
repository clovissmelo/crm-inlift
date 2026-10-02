"use client";

import { useCallback, useEffect, useState } from "react";
import { formatSpDateTime } from "@/lib/datetime";
import { formatPhoneDisplay } from "@/lib/format";
import type { PhoneDialContextItem } from "@/lib/call-strategy/eligible-phones";

const STATUS_LABELS: Record<string, string> = {
  available: "Disponível",
  waiting: "Aguardando próxima tentativa",
  exhausted: "Esgotado para ligação"
};

export function ClientDialPhonesPanel({ clientId }: { clientId: number }) {
  const [phones, setPhones] = useState<PhoneDialContextItem[]>([]);
  const [history, setHistory] = useState<
    Array<{
      id: number;
      client_phone_id: number;
      created_at: string;
      attempt_bucket: string;
      consumes_cycle: boolean;
      user_name: string | null;
      phone_display: string | null;
      technical_slug: string | null;
      commercial_slug: string | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState("");
  const [reactivateId, setReactivateId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/clients/${clientId}/dial-phones`);
    if (res.ok) {
      const j = (await res.json()) as {
        phones: PhoneDialContextItem[];
        history: typeof history;
        phone_summary: string;
      };
      setPhones(j.phones);
      setHistory(j.history ?? []);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reactivate(phoneId: number) {
    if (reason.trim().length < 3) return;
    const res = await fetch(`/api/clients/${clientId}/dial-phones/${phoneId}/reactivate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() })
    });
    if (res.ok) {
      setReactivateId(null);
      setReason("");
      await load();
    }
  }

  if (loading) return <p className="muted">Carregando telefones da estratégia…</p>;
  if (phones.length === 0) return <p className="muted">Sem telefone cadastrado — disponível para enriquecimento.</p>;

  return (
    <div className="panel" style={{ padding: 12, marginTop: 12 }}>
      <h4 style={{ marginTop: 0 }}>Estratégia de ligação por telefone</h4>
      {phones.map((p) => (
        <div key={p.client_phone_id} style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 8 }}>
          <strong>
            Telefone {p.position} de {p.total}
          </strong>{" "}
          · {formatPhoneDisplay(p.phone_display)}
          <div className="muted" style={{ fontSize: "0.8125rem" }}>
            Origem: {p.origin} · {p.attempt_label} · {STATUS_LABELS[p.status] ?? p.status}
          </div>
          {p.last_attempt_at ? (
            <div className="muted" style={{ fontSize: "0.75rem" }}>
              Última: {formatSpDateTime(p.last_attempt_at)}
              {p.last_bucket ? ` · ${p.last_bucket}` : ""}
            </div>
          ) : null}
          {p.next_eligible_at && p.status === "waiting" ? (
            <div className="muted" style={{ fontSize: "0.75rem" }}>
              Próxima tentativa: {formatSpDateTime(p.next_eligible_at)}
            </div>
          ) : null}
          {p.status === "exhausted" ? (
            <div style={{ marginTop: 6 }}>
              {reactivateId === p.client_phone_id ? (
                <>
                  <input
                    className="input"
                    placeholder="Motivo da reativação"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <button type="button" className="btn btn-sm" onClick={() => void reactivate(p.client_phone_id)}>
                    Confirmar
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => setReactivateId(null)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-sm" onClick={() => setReactivateId(p.client_phone_id)}>
                  Reativar número
                </button>
              )}
            </div>
          ) : null}
        </div>
      ))}
      {history.length > 0 ? (
        <details style={{ marginTop: 12 }}>
          <summary>Histórico de tentativas (estratégia)</summary>
          <ul style={{ fontSize: "0.8125rem", paddingLeft: 18 }}>
            {history.slice(0, 30).map((h) => (
              <li key={h.id}>
                {formatSpDateTime(h.created_at)}
                {h.user_name ? ` · ${h.user_name}` : ""}
                {h.phone_display ? ` · ${formatPhoneDisplay(h.phone_display)}` : ` · telefone #${h.client_phone_id}`}
                {" · "}
                {h.attempt_bucket}
                {h.consumes_cycle ? "" : " (não consome ciclo)"}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
