"use client";

import { AdminLeadMotorSegments } from "@/components/admin-lead-motor-segments";
import { PageIntro } from "@/components/page-intro";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Setting = {
  key: string;
  label: string;
  category: string;
  value: string | null;
  is_secret: boolean;
  has_value: boolean;
};

const VISIBLE_LEAD_KEYS = new Set(["lead_generation_simulation_default"]);

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
    const visible = data.settings.filter((s) => VISIBLE_LEAD_KEYS.has(s.key));
    setSettings(visible);
    const initial: Record<string, string> = {};
    for (const s of visible) initial[s.key] = s.value ?? "";
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
    setMessage("Salvo.");
    void load();
  }

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href="/admin">← Admin</Link>
      </p>
      <PageIntro>
        Opções do motor de novos leads. API4COM e Google ficam nos cards correspondentes na página Admin.
      </PageIntro>

      {message ? <div className="alert alert-info">{message}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      {loading ? <p className="muted">Carregando…</p> : null}

      <p className="muted" style={{ fontSize: "0.88rem" }}>
        <Link href="/admin/fluxos-geracao">Fluxos de geração →</Link>
      </p>
      <AdminLeadMotorSegments />

      <form onSubmit={save}>
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Parâmetros gerais</h2>
          {settings.map((s) => (
            <div key={s.key} className="field">
              <label className="label" htmlFor={s.key}>
                {s.key === "lead_generation_simulation_default"
                  ? "Modo simulação padrão (1 = sim, sem Google pago)"
                  : s.label}
              </label>
              <input
                id={s.key}
                className="input"
                value={draft[s.key] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <button className="btn btn-primary" type="submit" disabled={saving || loading}>
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </form>
    </div>
  );
}
