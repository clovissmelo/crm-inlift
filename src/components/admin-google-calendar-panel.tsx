"use client";

import { GoogleIntegrationPanel } from "@/components/google-integration-panel";
import { useCallback, useEffect, useState } from "react";

type SettingRow = {
  key: string;
  label: string;
  category: string;
  value: string | null;
  is_secret: boolean;
  has_value?: boolean;
};

export function AdminGoogleCalendarPanel() {
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [schedulingEmail, setSchedulingEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/settings");
    const data = (await res.json()) as { settings?: SettingRow[]; error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Falha ao carregar");
      return;
    }
    const rows = (data.settings ?? []).filter((s) => s.category === "google_calendar");
    setSettings(rows);
    const id = rows.find((r) => r.key === "google_oauth_client_id");
    const redir = rows.find((r) => r.key === "google_oauth_redirect_uri");
    const mail = rows.find((r) => r.key === "google_calendar_scheduling_email");
    if (id?.value) setClientId(id.value);
    if (redir?.value) setRedirectUri(redir.value);
    if (mail?.value) setSchedulingEmail(mail.value);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasSecret = settings.some((s) => s.key === "google_oauth_client_secret" && s.has_value);
  const configured = Boolean(clientId.trim() && hasSecret);

  async function saveCredentials(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    const payload: Array<{ key: string; value: string | null }> = [
      { key: "google_oauth_client_id", value: clientId.trim() || null },
      { key: "google_oauth_redirect_uri", value: redirectUri.trim() || null },
      { key: "google_calendar_scheduling_email", value: schedulingEmail.trim() || null }
    ];
    if (clientSecret.trim()) {
      payload.push({ key: "google_oauth_client_secret", value: clientSecret.trim() });
    }
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
    setClientSecret("");
    setMessage("Credenciais salvas no banco (criptografadas). O segredo não será exibido novamente.");
    void load();
  }

  if (loading) return <p className="muted">Carregando…</p>;

  return (
    <div>
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <p>
          OAuth:{" "}
          <strong>{configured ? "Configurado" : "Não configurado"}</strong>
        </p>
        <p className="muted">
          Client ID e Secret ficam em <code>system_settings</code>, não na Vercel. A URI de redirect pode ficar em branco: o CRM usa a URL do site +
          <code>/api/integrations/google/callback</code> (cadastre essa URL no Google Cloud).
        </p>
        {error ? <div className="alert alert-error">{error}</div> : null}
        {message ? <div className="alert">{message}</div> : null}
        <form onSubmit={saveCredentials}>
          <div className="field">
            <label className="label">Client ID</label>
            <input className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" />
          </div>
          <div className="field">
            <label className="label">Client Secret</label>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder={hasSecret ? "•••••••• (informe para substituir)" : ""}
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">Redirect URI (opcional)</label>
            <input
              className="input"
              placeholder="https://seu-dominio.com/api/integrations/google/callback"
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">E-mail da conta que agenda (referência)</label>
            <input className="input" value={schedulingEmail} onChange={(e) => setSchedulingEmail(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Salvando…" : "Salvar credenciais"}
          </button>
        </form>
      </div>
      <GoogleIntegrationPanel />
    </div>
  );
}
