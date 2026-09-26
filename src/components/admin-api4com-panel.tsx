"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Status = {
  configured: boolean;
  webhook_url: string;
  gateway: string;
  base_url: string;
  has_webhook_secret: boolean;
  docs: {
    calls: string;
    integrations: string;
    webhook_events: string[];
  };
};

export function AdminApi4comPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/api4com");
    const data = (await res.json()) as Status & { error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Erro ao carregar");
      return;
    }
    setStatus(data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function syncWebhook() {
    setSyncing(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/api4com", { method: "POST" });
    const data = (await res.json()) as { ok?: boolean; error?: string; webhook_url?: string };
    setSyncing(false);
    if (!res.ok) {
      setError(data.error ?? "Falha ao sincronizar");
      return;
    }
    setMessage("Webhook registrado na API4COM via PATCH /api/v1/integrations.");
    void load();
  }

  function copyWebhookUrl() {
    if (!status?.webhook_url) return;
    void navigator.clipboard.writeText(status.webhook_url);
    setMessage("URL copiada.");
  }

  return (
    <section className="panel" style={{ marginTop: "1.25rem" }}>
      <h2 style={{ marginTop: 0 }}>API4COM (telefonia)</h2>
      {loading ? <p className="muted">Carregando status…</p> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-info">{message}</div> : null}
      {status ? (
        <>
          <p>
            Status:{" "}
            <strong>{status.configured ? "Token configurado" : "Token ausente — configure abaixo ou via Vercel"}</strong>
          </p>
          <p className="muted" style={{ fontSize: "0.875rem" }}>
            Gateway (metadata): <code>{status.gateway}</code> · Base: <code>{status.base_url}</code>
            {status.has_webhook_secret ? " · Segredo de webhook ativo" : ""}
          </p>
          <div className="field">
            <label className="label">URL do webhook (CRM)</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input className="input" readOnly value={status.webhook_url || "— defina NEXT_PUBLIC_APP_URL —"} style={{ flex: 1, minWidth: 240 }} />
              <button type="button" className="btn" onClick={copyWebhookUrl} disabled={!status.webhook_url}>
                Copiar
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void syncWebhook()} disabled={syncing || !status.configured}>
                {syncing ? "Sincronizando…" : "Registrar webhook na API4COM"}
              </button>
            </div>
          </div>
          <ol className="muted" style={{ fontSize: "0.875rem", paddingLeft: "1.25rem", marginBottom: 0 }}>
            <li>
              Defina o token em <Link href="/admin/variaveis">Variáveis para as APIs</Link> (categoria API4COM) ou variáveis{" "}
              <code>API4COM_API_TOKEN</code> / <code>API4COM_GATEWAY</code> na Vercel.
            </li>
            <li>
              Confirme que o gateway na API4COM coincide com <code>{status.gateway}</code> — o webhook só processa chamadas com esse metadata.
            </li>
            <li>
              Clique em <strong>Registrar webhook na API4COM</strong> após o deploy (usa {status.docs.integrations}). Eventos:{" "}
              {status.docs.webhook_events.join(", ")}.
            </li>
            <li>
              Discagem pelo CRM usa {status.docs.calls} (não use /dialer).
            </li>
            <li>
              BDRs podem cadastrar <strong>ramal e token</strong> em Meu perfil; admins também em Admin → Usuários. Token
              global (Variáveis) vale se a BDR não tiver token próprio.
            </li>
          </ol>
        </>
      ) : null}
    </section>
  );
}
