"use client";

import { useEffect, useState } from "react";
import { CadastroModal } from "@/components/cadastro-ui";
import type { ReconsultFieldChange } from "@/lib/lead-discovery";

export function ClientReconsultModal({
  open,
  clientId,
  onClose,
  onApplied
}: {
  open: boolean;
  clientId: number;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [changes, setChanges] = useState<ReconsultFieldChange[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    void fetch(`/api/clients/${clientId}/reconsulta`)
      .then((r) => r.json())
      .then((data: { message?: string; changes?: ReconsultFieldChange[]; error?: string }) => {
        setMessage(data.message ?? null);
        setChanges(data.changes ?? []);
        const sel: Record<number, boolean> = {};
        (data.changes ?? []).forEach((_, i) => {
          sel[i] = true;
        });
        setSelected(sel);
        setLoading(false);
      })
      .catch(() => {
        setError("Falha ao carregar reconsulta.");
        setLoading(false);
      });
  }, [open, clientId]);

  async function applySelected() {
    setApplying(true);
    setError(null);
    const apply = changes
      .map((c, i) => ({ c, i }))
      .filter(({ i }) => selected[i])
      .map(({ c }) => {
        if (c.kind === "new" && (c.field === "phone" || c.field === "whatsapp")) {
          return { field: c.field, action: "add_contact" as const, value: c.incoming! };
        }
        if (c.kind === "replace" && (c.field === "website" || c.field === "instagram")) {
          return { field: c.field, action: "replace_client" as const, value: c.incoming! };
        }
        return null;
      })
      .filter(Boolean);

    const res = await fetch(`/api/clients/${clientId}/reconsulta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apply })
    });
    setApplying(false);
    if (!res.ok) {
      setError("Não foi possível aplicar as alterações.");
      return;
    }
    onApplied();
    onClose();
  }

  return (
    <CadastroModal open={open} title="Reconsultar dados do lead" onClose={onClose} wide>
      {loading ? <p className="muted">Consultando fontes externas…</p> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <p className="muted">{message}</p> : null}

      {!loading && changes.length === 0 ? <p className="muted">Nenhuma diferença encontrada no momento.</p> : null}

      {changes.length > 0 ? (
        <ul style={{ paddingLeft: 0, listStyle: "none" }}>
          {changes.map((c, i) => (
            <li key={`${c.field}-${i}`} className="panel" style={{ marginBottom: 8, padding: "0.75rem" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <input type="checkbox" checked={!!selected[i]} onChange={(e) => setSelected((s) => ({ ...s, [i]: e.target.checked }))} />
                <span>
                  <strong>{c.label}</strong> ({c.kind === "new" ? "novo" : "substituir"})
                  <br />
                  <span className="muted">Atual: {c.current ?? "—"}</span>
                  <br />
                  <span>Encontrado: {c.incoming ?? "—"}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="alert" style={{ fontSize: "0.8125rem" }}>
        Reconsultas pontuais também podem gerar cobrança de API quando o motor estiver ativo.
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" disabled={applying || loading || changes.length === 0} onClick={() => void applySelected()}>
          {applying ? "Aplicando…" : "Aplicar selecionados"}
        </button>
      </div>
    </CadastroModal>
  );
}
