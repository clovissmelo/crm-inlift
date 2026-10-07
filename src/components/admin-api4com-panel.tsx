"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { API4COM_TOKEN_POLICY_LABELS, type Api4comTokenPolicy } from "@/lib/api4com/token-policy-shared";

type Status = {
  configured: boolean;
  token_policy: Api4comTokenPolicy;
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

const API4COM_KEYS = [
  "api4com_api_token",
  "api4com_gateway",
  "api4com_webhook_secret",
  "api4com_token_policy",
  "api4com_sip_domain"
] as const;

export function AdminApi4comPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [tokenPolicy, setTokenPolicy] = useState<Api4comTokenPolicy>("global");
  const [gateway, setGateway] = useState("inlift-crm");
  const [sipDomain, setSipDomain] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [webhookSecretInput, setWebhookSecretInput] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [hasWebhookSecret, setHasWebhookSecret] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extensionsLoading, setExtensionsLoading] = useState(false);
  const [extensionsResult, setExtensionsResult] = useState<{
    sip_domain: string | null;
    extensions: Array<{
      id: number | null;
      ramal: string | null;
      senha: string | null;
      email: string | null;
      domain: string | null;
      first_name: string | null;
      last_name: string | null;
    }>;
    error?: string;
  } | null>(null);

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
    setTokenPolicy(data.token_policy ?? "global");

    if (settingsRes.ok) {
      const settingsData = (await settingsRes.json()) as { settings?: SettingRow[] };
      const rows = (settingsData.settings ?? []).filter((s) =>
        (API4COM_KEYS as readonly string[]).includes(s.key)
      );
      const gw = rows.find((r) => r.key === "api4com_gateway");
      if (gw?.value && gw.value !== "••••••••") setGateway(gw.value);
      const sip = rows.find((r) => r.key === "api4com_sip_domain");
      if (sip?.value && sip.value !== "••••••••") setSipDomain(sip.value);
      const pol = rows.find((r) => r.key === "api4com_token_policy");
      if (pol?.value && pol.value !== "••••••••") {
        setTokenPolicy(pol.value === "per_bdr" ? "per_bdr" : "global");
      }
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
      { key: "api4com_gateway", value: gateway.trim() || "inlift-crm" },
      { key: "api4com_token_policy", value: tokenPolicy },
      { key: "api4com_sip_domain", value: sipDomain.trim() || null }
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
    setMessage("Configuração API4COM salva.");
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

  async function loadExtensionsFromApi() {
    setExtensionsLoading(true);
    setExtensionsResult(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/api4com/extensions");
      const data = (await res.json()) as typeof extensionsResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível consultar ramais na API4COM.");
        return;
      }
      setExtensionsResult(data);
      setMessage(`Consulta API4COM: ${data.extensions?.length ?? 0} ramal(is).`);
    } catch {
      setError("Falha ao consultar ramais na API4COM.");
    } finally {
      setExtensionsLoading(false);
    }
  }

  const globalDialMode = tokenPolicy === "global";

  return (
    <div>
      {loading ? <p className="muted">Carregando…</p> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-info">{message}</div> : null}

      <section className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Credenciais</h2>
        <p className="muted" style={{ fontSize: "0.875rem" }}>
          URL base da API: <code>{status?.base_url ?? "https://api.api4com.com"}</code> — altere via{" "}
          <code>API4COM_BASE_URL</code> se necessário. Token e segredo ficam criptografados no banco.
        </p>
        <form onSubmit={saveCredentials}>
          <div className="field">
            <label className="label" htmlFor="api4com-token-policy">
              Quem cadastra o token para ligar?
            </label>
            <select
              id="api4com-token-policy"
              className="input"
              value={tokenPolicy}
              onChange={(e) => setTokenPolicy(e.target.value === "per_bdr" ? "per_bdr" : "global")}
            >
              {(["global", "per_bdr"] as const).map((val) => (
                <option key={val} value={val}>
                  {API4COM_TOKEN_POLICY_LABELS[val]}
                </option>
              ))}
            </select>
            <p className="muted" style={{ fontSize: "0.8125rem", marginBottom: 0, marginTop: "0.35rem" }}>
              {globalDialMode ? (
                <>
                  O administrador informa um <strong>token único</strong> abaixo. BDRs configuram só o <strong>ramal</strong>{" "}
                  em Meu perfil.
                </>
              ) : (
                <>
                  Cada BDR cadastra o <strong>próprio token</strong> em Meu perfil (e o ramal). O token de integração fica na
                  seção <strong>Webhook e telefonia</strong> (conta master). Ao alternar o modo, o que já foi salvo no servidor
                  permanece — nada é apagado.
                </>
              )}
            </p>
          </div>
          {globalDialMode ? (
            <div className="field">
              <label className="label" htmlFor="api4com-global-token">
                Token API (ligações de todas as BDRs)
              </label>
              <input
                id="api4com-global-token"
                className="input"
                type="password"
                autoComplete="new-password"
                placeholder={hasToken ? "•••••••• (informe para substituir)" : "Token da API4COM"}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
              />
            </div>
          ) : null}
          <div className="field">
            <label className="label">Gateway (metadata)</label>
            <input className="input" value={gateway} onChange={(e) => setGateway(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Domínio SIP (discador no CRM)</label>
            <input
              className="input"
              value={sipDomain}
              onChange={(e) => setSipDomain(e.target.value)}
              placeholder="suaempresa.api4com.com"
              autoComplete="off"
            />
            <p className="muted" style={{ fontSize: "0.8125rem", marginBottom: 0, marginTop: "0.35rem" }}>
              Realm/WSS do Webphone (porta 6443). Também pode usar <code>API4COM_SIP_DOMAIN</code> na Vercel.
            </p>
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
            {saving ? "Salvando…" : "Salvar configuração"}
          </button>
        </form>
        <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--border, #e2e8f0)" }}>
          <h3 style={{ marginTop: 0, fontSize: "1rem" }}>Ramais e senha SIP (API4COM)</h3>
          <p className="muted" style={{ fontSize: "0.8125rem" }}>
            Consulta <code>GET /extensions</code> com o token configurado no CRM. Se a API devolver o campo{" "}
            <code>senha</code>, aparece abaixo — use no Meu perfil → Senha SIP (discador).
          </p>
          <button type="button" className="btn" disabled={extensionsLoading} onClick={() => void loadExtensionsFromApi()}>
            {extensionsLoading ? "Consultando…" : "Consultar ramais na API4COM"}
          </button>
          {extensionsResult?.extensions?.length ? (
            <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ramal</th>
                    <th>Senha SIP</th>
                    <th>E-mail</th>
                    <th>Domínio</th>
                  </tr>
                </thead>
                <tbody>
                  {extensionsResult.extensions.map((ex) => (
                    <tr key={`${ex.id ?? ""}-${ex.ramal ?? ""}-${ex.email ?? ""}`}>
                      <td>{ex.ramal ?? "—"}</td>
                      <td>
                        {ex.senha ? (
                          <code>{ex.senha}</code>
                        ) : (
                          <span className="muted">não retornada pela API</span>
                        )}
                      </td>
                      <td>{ex.email ?? "—"}</td>
                      <td>{ex.domain ?? extensionsResult.sip_domain ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : extensionsResult && !extensionsResult.extensions?.length ? (
            <p className="muted" style={{ marginTop: "0.5rem" }}>
              Nenhum ramal na resposta.
            </p>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Webhook e telefonia</h2>
        {status ? (
          <>
            <p>
              Status integração:{" "}
              <strong>
                {status.configured
                  ? globalDialMode
                    ? "Token global configurado"
                    : "Token de integração configurado"
                  : globalDialMode
                    ? "Cadastre o token global acima"
                    : "Cadastre o token de integração abaixo (webhook)"}
              </strong>
            </p>
            {!globalDialMode ? (
              <p className="muted" style={{ fontSize: "0.8125rem", marginTop: 0 }}>
                As <strong>ligações</strong> usam o token de cada BDR em Meu perfil. O token abaixo é só para{" "}
                <strong>webhook</strong> (status da chamada no CRM) — não é obrigatório para discar.
              </p>
            ) : null}
            {!globalDialMode ? (
              <div className="field">
                <label className="label" htmlFor="api4com-integration-token">
                  Token API (integração / webhook)
                </label>
                <input
                  id="api4com-integration-token"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  placeholder={hasToken ? "•••••••• (informe para substituir)" : "Token da conta master na API4COM"}
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                />
                <p className="muted" style={{ fontSize: "0.8125rem", marginBottom: 0, marginTop: "0.35rem" }}>
                  Usado só para registrar o webhook. Ligações usam o token de cada BDR em Meu perfil.
                </p>
              </div>
            ) : null}
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
                Eventos: {status.docs.webhook_events.join(", ")}. Se ficar inativo no painel API4COM, cole a URL e ative
                manualmente.
              </li>
              <li>
                {globalDialMode ? (
                  <>
                    BDRs: apenas <strong>ramal</strong> em <Link href="/perfil">Meu perfil</Link> ou Admin → Usuários.
                  </>
                ) : (
                  <>
                    BDRs: <strong>ramal e token</strong> em <Link href="/perfil">Meu perfil</Link> (obrigatório para ligar).
                  </>
                )}
              </li>
            </ol>
          </>
        ) : null}
      </section>
    </div>
  );
}
