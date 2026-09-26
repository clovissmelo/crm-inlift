"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { GoogleIntegrationPanel } from "@/components/google-integration-panel";

type Setting = {
  key: string;
  label: string;
  category: string;
  value: string | null;
  is_secret: boolean;
  has_value: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  google_calendar: "Google Agenda / Meet",
  google_places: "Google Places (novos leads)",
  lead_discovery: "Motor de leads",
  api4com: "API4COM (telefonia)"
};

export function AdminApiVariables() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/settings");
    const data = (await res.json()) as { settings: Setting[]; error?: string };
    if (!res.ok) {
      setError(data.error ?? "Erro ao carregar");
      setLoading(false);
      return;
    }
    setSettings(data.settings);
    const initial: Record<string, string> = {};
    for (const s of data.settings) initial[s.key] = s.value ?? "";
    setDraft(initial);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: settings.map((s) => ({ key: s.key, value: draft[s.key]?.trim() || null }))
      })
    });
    setSaving(false);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Erro ao salvar");
      return;
    }
    setMessage("Variáveis salvas.");
    void load();
  }

  const byCategory = settings.reduce<Record<string, Setting[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href="/admin">← Admin</Link>
      </p>
      <h1 style={{ marginTop: 0 }}>Variáveis para as APIs</h1>
      <p className="muted">
        Valores usados pelo CRM e pelo motor de novos leads. Podem ser alterados ao longo do projeto (ex.: e-mail que agenda Meet, chave Places).
      </p>

      {message ? <div className="alert alert-info">{message}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      {loading ? <p className="muted">Carregando…</p> : null}

      <form onSubmit={save}>
        {Object.entries(byCategory).map(([category, rows]) => (
          <div key={category} className="panel" style={{ marginBottom: "1rem" }}>
            <h2 style={{ marginTop: 0, fontSize: "1rem" }}>{CATEGORY_LABELS[category] ?? category}</h2>
            {rows.map((s) => (
              <div key={s.key} className="field">
                <label className="label" htmlFor={s.key}>
                  {s.label}
                </label>
                <input
                  id={s.key}
                  className="input"
                  type={s.is_secret ? "password" : "text"}
                  autoComplete="off"
                  placeholder={s.is_secret && s.has_value ? "•••••••• (preencha para trocar)" : ""}
                  value={draft[s.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        ))}

        <button className="btn btn-primary" type="submit" disabled={saving || loading}>
          {saving ? "Salvando…" : "Salvar variáveis"}
        </button>
      </form>

      <div style={{ marginTop: "1.5rem" }}>
        <GoogleIntegrationPanel />
      </div>
    </div>
  );
}
