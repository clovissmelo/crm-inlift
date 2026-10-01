"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CallStrategySettings, ResultRuleRow } from "@/lib/call-strategy/settings";
import type { ProspeccaoPriorityTypeRow } from "@/lib/call-strategy/priorities-config";

function ReEvalPreviewButton() {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function runPreview() {
    setLoading(true);
    setPreview(null);
    const res = await fetch("/api/admin/call-strategy/re-evaluate");
    if (res.ok) {
      const j = (await res.json()) as {
        preview: { phones_total: number; would_exhaust: number; samples: unknown[] };
      };
      setPreview(
        `${j.preview.would_exhaust} telefone(s) passariam a esgotar/revisar entre ${j.preview.phones_total} analisados (prévia — nada foi alterado).`
      );
    }
    setLoading(false);
  }
  return (
    <div style={{ marginBottom: 16 }}>
      <button type="button" className="btn" disabled={loading} onClick={() => void runPreview()}>
        {loading ? "Calculando…" : "Prévia de reavaliação de limites"}
      </button>
      {preview ? <p className="muted" style={{ marginTop: 8 }}>{preview}</p> : null}
    </div>
  );
}

const BUCKET_LABELS: Record<string, string> = {
  no_answer: "Não atendeu / ocupado",
  invalid: "Número inválido",
  wrong_number: "Número errado (conversa)",
  technical_fail: "Falha técnica",
  conversation_success: "Conversa válida"
};

export function ProspeccaoStrategyAdmin() {
  const [tab, setTab] = useState<"priorities" | "strategy">("strategy");
  const [settings, setSettings] = useState<CallStrategySettings | null>(null);
  const [rules, setRules] = useState<ResultRuleRow[]>([]);
  const [priorities, setPriorities] = useState<ProspeccaoPriorityTypeRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [sRes, rRes, pRes] = await Promise.all([
      fetch("/api/admin/call-strategy/settings"),
      fetch("/api/admin/call-strategy/result-rules"),
      fetch("/api/admin/prospeccao-priorities")
    ]);
    if (sRes.ok) {
      const j = (await sRes.json()) as { settings: CallStrategySettings };
      setSettings(j.settings);
    }
    if (rRes.ok) {
      const j = (await rRes.json()) as { items: ResultRuleRow[] };
      setRules(j.items);
    }
    if (pRes.ok) {
      const j = (await pRes.json()) as { items: ProspeccaoPriorityTypeRow[] };
      setPriorities(j.items);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSettings() {
    if (!settings) return;
    setMsg(null);
    const res = await fetch("/api/admin/call-strategy/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setMsg(j.error ?? "Erro ao salvar");
      return;
    }
    setMsg("Configurações salvas.");
  }

  async function savePriority(row: ProspeccaoPriorityTypeRow) {
    setMsg(null);
    const res = await fetch("/api/admin/prospeccao-priorities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: row.id,
        name: row.name,
        description: row.description,
        color: row.color,
        sort_order: row.sort_order
      })
    });
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setMsg(j.error ?? "Erro ao salvar prioridade");
      return;
    }
    await load();
    setMsg("Prioridade atualizada.");
  }

  async function toggleRuleConsumes(rule: ResultRuleRow) {
    const res = await fetch("/api/admin/call-strategy/result-rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, consumes_attempt: !rule.consumes_attempt })
    });
    if (res.ok) await load();
  }

  if (loading) return <p className="muted">Carregando…</p>;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          className={tab === "strategy" ? "btn btn-primary" : "btn"}
          onClick={() => setTab("strategy")}
        >
          Estratégia de ligações
        </button>
        <button
          type="button"
          className={tab === "priorities" ? "btn btn-primary" : "btn"}
          onClick={() => setTab("priorities")}
        >
          Prioridades operacionais
        </button>
      </div>
      {msg ? <p className="muted">{msg}</p> : null}

      {tab === "strategy" && settings ? (
        <div>
          <p className="muted" style={{ maxWidth: 640 }}>
            Valores <strong>padrão</strong> quando a matriz de associações não define limite/intervalo por linha.
            Contagem e esgotamento por resultado são configurados em{" "}
            <a href="/resultado-comercial">Resultado comercial → Matriz de associações</a> (seção Tentativas e
            esgotamento). Alterações de limite não removem leads automaticamente — use a reavaliação abaixo.
          </p>
          <ReEvalPreviewButton />
          <div className="panel" style={{ padding: 16, marginTop: 12, maxWidth: 480 }}>
            <div className="field">
              <label className="label">Máx. não atendeu/ocupado por número</label>
              <input
                className="input"
                type="number"
                min={1}
                value={settings.max_no_answer_attempts}
                onChange={(e) =>
                  setSettings((s) => s && { ...s, max_no_answer_attempts: Number(e.target.value) })
                }
              />
            </div>
            <div className="field">
              <label className="label">Máx. inválido por número</label>
              <input
                className="input"
                type="number"
                min={1}
                value={settings.max_invalid_attempts}
                onChange={(e) =>
                  setSettings((s) => s && { ...s, max_invalid_attempts: Number(e.target.value) })
                }
              />
            </div>
            <div className="field">
              <label className="label">Máx. número errado por número</label>
              <input
                className="input"
                type="number"
                min={1}
                value={settings.max_wrong_number_attempts}
                onChange={(e) =>
                  setSettings((s) => s && { ...s, max_wrong_number_attempts: Number(e.target.value) })
                }
              />
            </div>
            <div className="field">
              <label className="label">Intervalo mínimo entre tentativas (minutos)</label>
              <input
                className="input"
                type="number"
                min={0}
                value={settings.min_interval_minutes}
                onChange={(e) =>
                  setSettings((s) => s && { ...s, min_interval_minutes: Number(e.target.value) })
                }
              />
            </div>
            <div className="field">
              <label className="label">Nova rodada de contatos (horas)</label>
              <input
                className="input"
                type="number"
                min={0}
                value={settings.round_interval_hours}
                onChange={(e) =>
                  setSettings((s) => s && { ...s, round_interval_hours: Number(e.target.value) })
                }
              />
            </div>
            <button type="button" className="btn btn-primary" onClick={() => void saveSettings()}>
              Salvar limites
            </button>
          </div>

          <p className="muted">
            Regras legadas de fallback: preferir a{" "}
            <Link href="/resultado-comercial">matriz de associações</Link>. Tabela abaixo só para compatibilidade.
          </p>
          <table className="table" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Bucket</th>
                <th>Técnico</th>
                <th>Comercial</th>
                <th>Contato</th>
                <th>Consome tentativa</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>{BUCKET_LABELS[r.bucket] ?? r.bucket}</td>
                  <td>{r.technical_slug ?? "—"}</td>
                  <td>{r.commercial_slug ?? "—"}</td>
                  <td>{r.contact_outcome_slug ?? "—"}</td>
                  <td>
                    <button type="button" className="btn btn-sm" onClick={() => void toggleRuleConsumes(r)}>
                      {r.consumes_attempt ? "Sim" : "Não"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "priorities" ? (
        <div>
          <p className="muted" style={{ maxWidth: 640 }}>
            Prioridades são calculadas automaticamente (retornos, abordagens). Ajuste nome, cor, descrição e ordem de
            exibição. Retornos futuros não são sugeridos como ligação imediata.
          </p>
          {priorities.map((p) => (
            <div key={p.id} className="panel" style={{ padding: 12, marginTop: 12, maxWidth: 560 }}>
              <div className="field">
                <label className="label">Slug (fixo)</label>
                <input className="input" value={p.slug} readOnly />
              </div>
              <div className="field">
                <label className="label">Nome</label>
                <input
                  className="input"
                  value={p.name}
                  onChange={(e) =>
                    setPriorities((rows) =>
                      rows.map((r) => (r.id === p.id ? { ...r, name: e.target.value } : r))
                    )
                  }
                />
              </div>
              <div className="field">
                <label className="label">Cor</label>
                <input
                  className="input"
                  value={p.color}
                  onChange={(e) =>
                    setPriorities((rows) =>
                      rows.map((r) => (r.id === p.id ? { ...r, color: e.target.value } : r))
                    )
                  }
                />
              </div>
              <div className="field">
                <label className="label">Ordem</label>
                <input
                  className="input"
                  type="number"
                  value={p.sort_order}
                  onChange={(e) =>
                    setPriorities((rows) =>
                      rows.map((r) => (r.id === p.id ? { ...r, sort_order: Number(e.target.value) } : r))
                    )
                  }
                />
              </div>
              <div className="field">
                <label className="label">Descrição</label>
                <textarea
                  className="textarea"
                  value={p.description ?? ""}
                  onChange={(e) =>
                    setPriorities((rows) =>
                      rows.map((r) => (r.id === p.id ? { ...r, description: e.target.value } : r))
                    )
                  }
                />
              </div>
              <button type="button" className="btn btn-primary" onClick={() => void savePriority(p)}>
                Salvar
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
