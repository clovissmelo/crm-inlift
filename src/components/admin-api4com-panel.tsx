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

type SettingRow = {
  key: string;
  label: string;
  value: string | null;
  is_secret: boolean;
  has_value?: boolean;
};

const API4COM_KEYS = ["api4com_api_token", "api4com_gateway", "api4com_webhook_secret"] as const;

export function AdminApi4comPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [gateway, setGateway] = useState("inlift-crm");
  const [tokenInput, setTokenInput] = useState("");
  const [webhookSecretInput, setWebhookSecretInput] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [hasWebhookSecret, setHasWebhookSecret] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [statusRes, settingsRes] = await Promise.all([
      fetch("/api/admin/api4com"),
      fetch("/api/admin/settings")
    ]);
    const data = (await statusRes.json()) as Status & { error?: string };
    if (!statusRes.ok) {
      setError(data.error ?? "Erro ao carregar");
      setLoading(false);
      return;
    }
    setStatus(data);

    if (settingsRes.ok) {
      const settingsData = (await settingsRes.json()) as { settings?: SettingRow[] };
      const rows = (settingsData.settings ?? []).filter((s) =>
        (API4COM_KEYS as readonly string[]).includes(s.key)
      );
      const gw = rows.find((r) => r.key === "api4com_gateway");
      if (gw?.value) setGateway(gw.value);
      setHasToken(Boolean(rows.find((r) => r.key === "api4com_api_token")?.has_value));
      setHasWebhookSecret(Boolean(rows.find((r) => r.key === "api4com_webhook_secret")?.has_value));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveCredentials(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    const payload: Array<{ key: string; value: string | null }> = [
      { key: "api4com_gateway", value: gateway.trim() || "inlift-crm" }
    ];
    if (tokenInput.trim()) payload.push({ key: "api4com_api_token", value: tokenInput.trim() });
    if (webhookSecretInput.trim()) payload.push({ key: "api4com_webhook_secret", value: webhookSecretInput.trim() });
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: payload })
    });
    setSaving(false);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Falha ao salvar");
      return;
    }
    setTokenInput("");
    setWebhookSecretInput("");
    setMessage("Credenciais API4COM salvas no banco.");
    void load();
  }

  async function syncWebhook() {
    setSyncing(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/api4com", { method: "POST" });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    setSyncing(false);
    if (!res.ok) {
      setError(data.error ?? "Falha ao sincronizar");
      return;
    }
    setMessage("Webhook registrado na API4COM.");
    void load();
  }

  function copyWebhookUrl() {
    if (!status?.webhook_url) return;
    void navigator.clipboard.writeText(status.webhook_url);
    setMessage("URL copiada.");
  }

  return (
    <div>
      {loading ? <p className="muted">Carregando…</p> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-info">{message}</div> : null}

      <section className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Credenciais</h2>
        <p className="muted" style={{ fontSize: "0.875rem" }}>
          Tudo fica nesta página (banco criptografado para token e segredo). URL base da API:{" "}
          <code>{status?.base_url ?? "https://api.api4com.com"}</code> — altere só via variável de ambiente{" "}
          <code>API4COM_BASE_URL</code> se necessário.
        </p>
        <form onSubmit={saveCredentials}>
          <div className="field">
            <label className="label">Token API</label>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder={hasToken ? "•••••••• (informe para substituir)" : "Token da API4COM"}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">Gateway (metadata)</label>
            <input className="input" value={gateway} onChange={(e) => setGateway(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Segredo do webhook (opcional)</label>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder={hasWebhookSecret ? "•••••••• (informe para substituir)" : ""}
              value={webhookSecretInput}
              onChange={(e) => setWebhookSecretInput(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Salvando…" : "Salvar credenciais"}
          </button>
        </form>
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Webhook e telefonia</h2>
        {status ? (
          <>
            <p>
              Status: <strong>{status.configured ? "Token configurado" : "Informe o token acima"}</strong>
            </p>
            <div className="field">
              <label className="label">URL do webhook (CRM)</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  className="input"
                  readOnly
                  value={status.webhook_url || "— defina NEXT_PUBLIC_APP_URL —"}
                  style={{ flex: 1, minWidth: 240 }}
                />
                <button type="button" className="btn" onClick={copyWebhookUrl} disabled={!status.webhook_url}>
                  Copiar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void syncWebhook()}
                  disabled={syncing || !status.configured}
                >
                  {syncing ? "Sincronizando…" : "Registrar webhook na API4COM"}
                </button>
              </div>
            </div>
            <ol className="muted" style={{ fontSize: "0.875rem", paddingLeft: "1.25rem", marginBottom: 0 }}>
              <li>
                Gateway na API4COM deve ser <code>{status.gateway}</code>.
              </li>
              <li>
                Eventos: {status.docs.webhook_events.join(", ")}. Se ficar inativo no painel API4COM, cole a URL e
                ative manualmente.
              </li>
              <li>
                BDRs: ramal/token em <Link href="/perfil">Meu perfil</Link> ou Admin → Usuários. Token global vale se a
                BDR não tiver token próprio.
              </li>
            </ol>
          </>
        ) : null}
      </section>
    </div>
  );
}
