"use client";

import { userMessageForOAuthError } from "@/lib/google-oauth-connect-error";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Status = {
  configured: boolean;
  connected: boolean;
  account_email: string | null;
  calendar_id: string | null;
  message?: string | null;
};

export function GoogleIntegrationPanel() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/integrations/google");
    if (res.ok) setStatus((await res.json()) as Status);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const err = searchParams.get("error");
    const ok = searchParams.get("connected");
    if (ok) {
      setError(null);
      setSuccess("Google Agenda conectado com sucesso.");
      void load();
      return;
    }
    setSuccess(null);
    setError(userMessageForOAuthError(err));
  }, [searchParams, load]);

  async function disconnect() {
    setError(null);
    const res = await fetch("/api/integrations/google/disconnect", { method: "POST" });
    if (!res.ok) {
      setError("Falha ao desconectar.");
      return;
    }
    void load();
  }

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Google Agenda e Meet</h2>
      {loading ? <p className="muted">Carregando…</p> : null}
      {success ? <div className="alert">{success}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}
      {status && !loading ? (
        <>
          <p>
            <span className="muted">Credenciais OAuth (banco):</span> {status.configured ? "OK" : "Pendente"}
          </p>
          <p>
            <span className="muted">Conexão:</span>{" "}
            {status.connected ? `Conectado como ${status.account_email ?? "—"}` : status.message ?? "Google Agenda não conectado"}
          </p>
          {status.calendar_id ? (
            <p>
              <span className="muted">Calendário:</span> {status.calendar_id}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {status.configured && !status.connected ? (
              <a className="btn btn-primary" href="/api/integrations/google/connect">
                Conectar conta Google
              </a>
            ) : null}
            {status.connected ? (
              <button type="button" className="btn" onClick={() => void disconnect()}>
                Desconectar
              </button>
            ) : null}
          </div>
          {!status.configured ? (
            <p className="muted" style={{ marginTop: 12 }}>
              Sem credenciais, os agendamentos continuam funcionando apenas no FUNON, sem link automático do Meet.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
