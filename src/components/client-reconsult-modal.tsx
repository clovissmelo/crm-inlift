"use client";

import { useEffect, useState } from "react";
import { CadastroModal } from "@/components/cadastro-ui";
import type { ReconsultApplyOp, ReconsultFieldChange } from "@/lib/lead-discovery";

type RowDecision = "keep" | "apply";

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
  const [flowLabel, setFlowLabel] = useState<string | null>(null);
  const [productName, setProductName] = useState<string | null>(null);
  const [changes, setChanges] = useState<ReconsultFieldChange[]>([]);
  const [decision, setDecision] = useState<Record<string, RowDecision>>({});
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    void fetch(`/api/clients/${clientId}/reconsulta`)
      .then((r) => r.json())
      .then(
        (data: {
          message?: string;
          changes?: ReconsultFieldChange[];
          error?: string;
          flow_label?: string | null;
          product_name?: string | null;
          status?: string;
        }) => {
          if (data.error) {
            setError(data.error);
            setChanges([]);
            setLoading(false);
            return;
          }
          if (data.status === "failed") {
            setError(data.message ?? "Reconsulta indisponível.");
            setChanges([]);
            setLoading(false);
            return;
          }
          setMessage(data.message ?? null);
          setFlowLabel(data.flow_label ?? null);
          setProductName(data.product_name ?? null);
          const list = data.changes ?? [];
          setChanges(list);
          const initial: Record<string, RowDecision> = {};
          for (const c of list) {
            initial[c.key] = "apply";
          }
          setDecision(initial);
          setLoading(false);
        }
      )
      .catch(() => {
        setError("Falha ao carregar reconsulta.");
        setLoading(false);
      });
  }, [open, clientId]);

  function setAllRows(mode: RowDecision) {
    const next: Record<string, RowDecision> = {};
    for (const c of changes) next[c.key] = mode;
    setDecision(next);
  }

  async function submitApply(mode: "selected" | "all") {
    const apply: ReconsultApplyOp[] = changes
      .filter((c) => c.apply && (mode === "all" || decision[c.key] === "apply"))
      .map((c) => c.apply!);

    if (apply.length === 0) {
      onClose();
      return;
    }

    setApplying(true);
    setError(null);
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

  const applyCount = changes.filter((c) => c.apply && decision[c.key] === "apply").length;

  return (
    <CadastroModal open={open} title="Reconsultar dados do lead" onClose={onClose} wide>
      {loading ? <p className="muted">Rodando fluxo do motor (ANP, Google, Receita, site)…</p> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}
      {!loading && !error && (productName || flowLabel) ? (
        <p className="muted" style={{ marginTop: 0 }}>
          {[productName, flowLabel].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      {message && !error ? <p className="muted">{message}</p> : null}

      {!loading && !error && changes.length === 0 ? (
        <p className="muted">Nenhuma diferença em relação ao cadastro atual.</p>
      ) : null}

      {changes.length > 0 ? (
        <ul className="lead-reconsult-list">
          {changes.map((c) => (
            <li key={c.key} className="lead-reconsult-row panel">
              <div className="lead-reconsult-row-head">
                <strong>{c.label}</strong>
                {c.kind === "new" ? <span className="badge badge-new">Novo</span> : null}
                {c.origin ? <span className="muted lead-reconsult-origin">{c.origin}</span> : null}
              </div>
              <div className="lead-reconsult-diff muted">
                <span>
                  De: <span className="lead-reconsult-val">{c.current ?? "—"}</span>
                </span>
                <span aria-hidden className="lead-reconsult-arrow">
                  →
                </span>
                <span>
                  Para: <span className="lead-reconsult-val lead-reconsult-val--incoming">{c.incoming ?? "—"}</span>
                </span>
              </div>
              <div className="lead-reconsult-actions" role="group" aria-label={`Manter ou alterar ${c.label}`}>
                <button
                  type="button"
                  className={`btn btn-sm ${decision[c.key] === "keep" ? "btn-primary" : ""}`}
                  onClick={() => setDecision((d) => ({ ...d, [c.key]: "keep" }))}
                >
                  Manter
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${decision[c.key] === "apply" ? "btn-primary" : ""}`}
                  onClick={() => setDecision((d) => ({ ...d, [c.key]: "apply" }))}
                >
                  Alterar
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="alert" style={{ fontSize: "0.8125rem" }}>
        Consome cota de API Google quando o fluxo incluir Places (como na geração de leads).
      </div>

      <div className="lead-reconsult-footer">
        <button type="button" className="btn" onClick={onClose} disabled={applying}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn"
          disabled={loading || applying}
          onClick={() => {
            setAllRows("keep");
            onClose();
          }}
        >
          Manter tudo
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={loading || applying || changes.length === 0}
          onClick={() => void submitApply("selected")}
        >
          {applying ? "Aplicando…" : `Aplicar selecionados (${applyCount})`}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={loading || applying || changes.length === 0}
          onClick={() => void submitApply("all")}
        >
          Alterar tudo
        </button>
      </div>
    </CadastroModal>
  );
}
