"use client";

import { PageIntro } from "@/components/page-intro";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Setting = {
  key: string;
  label: string;
  category: string;
  value: string | null;
};

const ANP_SETTING_KEYS = new Set(["lead_generation_simulation_default", "lead_discovery_provider"]);

export function AdminAnpVariables() {
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
    const visible = data.settings.filter((s) => ANP_SETTING_KEYS.has(s.key));
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

  function labelFor(key: string, fallback: string) {
    if (key === "lead_generation_simulation_default") {
      return "Modo simulação padrão (1 = sim, sem Google pago na geração)";
    }
    if (key === "lead_discovery_provider") {
      return "Provedor do motor de descoberta";
    }
    return fallback;
  }

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href="/admin">← Admin</Link>
      </p>
      <PageIntro>
        Parâmetros técnicos da consulta ANP e do motor de novos leads. Segmentos (filtro bandeira/tipo de posto) ficam em{" "}
        <Link href="/admin/variaveis">Segmentos ANP</Link>; fluxos de enriquecimento em{" "}
        <Link href="/admin/fluxos-geracao">Fluxos de geração</Link>.
      </PageIntro>

      {message ? <div className="alert alert-info">{message}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Fontes ANP no sistema</h2>
        <ul className="muted" style={{ fontSize: "0.88rem", margin: 0, paddingLeft: "1.2rem" }}>
          <li>
            <strong>Revendedores (postos):</strong> API pública da ANP por município — sem URL extra no Admin.
          </li>
          <li>
            <strong>Distribuidoras:</strong> CSV dedicado via variável de ambiente{" "}
            <code>ANP_DISTRIBUTORS_DATA_URL</code> na Vercel (dados abertos ANP).
          </li>
          <li>
            <strong>Produto → segmento + fluxo:</strong> cadastro em Produtos; o segmento listado vem de Segmentos ANP.
          </li>
        </ul>
      </div>

      {loading ? <p className="muted">Carregando…</p> : null}

      <form onSubmit={save}>
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Parâmetros</h2>
          {settings.length === 0 && !loading ? (
            <p className="muted">Nenhuma variável cadastrada no banco para esta seção.</p>
          ) : null}
          {settings.map((s) => (
            <div key={s.key} className="field">
              <label className="label" htmlFor={s.key}>
                {labelFor(s.key, s.label)}
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
