"use client";

import { useCallback, useEffect, useState } from "react";

type SettingRow = {
  key: string;
  label: string;
  category: string;
  value: string | null;
  is_secret: boolean;
  has_value?: boolean;
};

export function AdminGooglePlacesPanel() {
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [dailyLimit, setDailyLimit] = useState("200");
  const [perRunLimit, setPerRunLimit] = useState("50");
  const [simulationDefault, setSimulationDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
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
    const rows = (data.settings ?? []).filter((s) => s.category === "google_places" || s.key === "lead_generation_simulation_default");
    setSettings(rows);
    const daily = rows.find((r) => r.key === "google_places_daily_limit");
    const perRun = rows.find((r) => r.key === "google_places_per_run_limit");
    const sim = rows.find((r) => r.key === "lead_generation_simulation_default");
    if (daily?.value) setDailyLimit(daily.value);
    if (perRun?.value) setPerRunLimit(perRun.value);
    setSimulationDefault(sim?.value === "1" || sim?.value === "true");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasKey = settings.some((s) => s.key === "google_places_api_key" && s.has_value);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    const payload: Array<{ key: string; value: string | null }> = [
      { key: "google_places_daily_limit", value: dailyLimit },
      { key: "google_places_per_run_limit", value: perRunLimit },
      { key: "lead_generation_simulation_default", value: simulationDefault ? "1" : "0" }
    ];
    if (apiKeyInput.trim()) {
      payload.push({ key: "google_places_api_key", value: apiKeyInput.trim() });
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
    setApiKeyInput("");
    setMessage("Configurações salvas. A chave não será exibida novamente.");
    void load();
  }

  async function testConnection() {
    setTesting(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/google-places/test", { method: "POST" });
    const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
    setTesting(false);
    if (!res.ok || !data.ok) {
      setError(data.error ?? "Teste falhou");
      return;
    }
    setMessage(data.message ?? "OK");
  }

  if (loading) return <p className="muted">Carregando…</p>;

  return (
    <div className="panel">
      <p>
        Status:{" "}
        <strong className={hasKey ? "text-success" : "text-warning"}>{hasKey ? "Configurado" : "Não configurado"}</strong>
      </p>
      <p className="muted">
        A chave é armazenada criptografada no banco. O CRM usa <strong>Places API (New)</strong> (Text Search + Place Details).
        Ative “Places API (New)” no Google Cloud e billing. Custo ≈ 2 requisições por posto enriquecido (busca + detalhes).
      </p>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert">{message}</div> : null}

      <form onSubmit={save}>
        <div className="field">
          <label className="label">Chave API Google Places</label>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            placeholder={hasKey ? "•••••••• (informe nova chave para substituir)" : "Cole a chave aqui"}
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
          />
        </div>
        <div className="filters-row">
          <div className="field">
            <label className="label">Limite diário (chamadas)</label>
            <input className="input" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Limite padrão por execução</label>
            <input className="input" value={perRunLimit} onChange={(e) => setPerRunLimit(e.target.value)} />
          </div>
        </div>
        <label style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input type="checkbox" checked={simulationDefault} onChange={(e) => setSimulationDefault(e.target.checked)} />
          <span>Modo simulação padrão (sem Google/Receita paga — apenas ANP ao gerar)</span>
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
          <button className="btn" type="button" disabled={testing || !hasKey} onClick={() => void testConnection()}>
            {testing ? "Testando…" : "Testar conexão (Places API New)"}
          </button>
        </div>
      </form>
    </div>
  );
}
