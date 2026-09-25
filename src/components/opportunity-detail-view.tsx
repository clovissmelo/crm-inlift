"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatSpDateTime } from "@/lib/datetime";
import type { User } from "@/lib/types";

const TEMP = [
  { v: "cold", l: "Frio" },
  { v: "warm", l: "Morno" },
  { v: "hot", l: "Quente" }
];

export function OpportunityDetailView({ opportunityId, users }: { opportunityId: number; users: User[] }) {
  const router = useRouter();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [sentChannel, setSentChannel] = useState("");
  const [sentDate, setSentDate] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/opportunities/${opportunityId}`);
    if (!res.ok) {
      setError("Oportunidade não encontrada");
      return;
    }
    const d = (await res.json()) as { opportunity: Record<string, unknown>; proposals: unknown[] };
    setData(d as Record<string, unknown>);
    setVersion(Number(d.opportunity.row_version ?? 1));
  }, [opportunityId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <p className="muted">Carregando…</p>;

  const opp = data.opportunity as Record<string, unknown>;
  const usesProposal = Boolean(opp.uses_proposal);
  const proposals = (data.proposals ?? []) as Array<Record<string, unknown>>;

  async function saveField(patch: Record<string, unknown>) {
    const res = await fetch(`/api/opportunities/${opportunityId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...patch, expected_version: version })
    });
    if (res.status === 409) {
      setError("Conflito de versão. Recarregando…");
      void load();
      return;
    }
    if (!res.ok) return;
    void load();
    router.refresh();
  }

  async function uploadProposal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploading(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/opportunities/${opportunityId}/proposals`, { method: "POST", body: form });
    setUploading(false);
    if (!res.ok) {
      const d = (await res.json()) as { error?: string };
      setError(d.error ?? "Falha no upload");
      return;
    }
    void load();
    e.currentTarget.reset();
  }

  async function markSent(proposalId: number) {
    if (!sentDate || !sentChannel.trim()) {
      setError("Informe data e canal de envio (informação declarada pelo usuário).");
      return;
    }
    await fetch(`/api/opportunities/${opportunityId}/proposals/${proposalId}/sent`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sent_at: new Date(`${sentDate}T12:00:00-03:00`).toISOString(),
        sent_channel: sentChannel
      })
    });
    void load();
  }

  return (
    <div>
      <p style={{ marginTop: 0 }}>
        <Link href="/funil">← Funil</Link> · <Link href={`/clientes/${opp.client_id}`}>Cliente</Link>
      </p>
      <h1 style={{ marginTop: 0 }}>{String(opp.title)}</h1>
      <p className="muted">
        {String(opp.client_name)} · {String(opp.product_name)} · Etapa: {String(opp.stage_name)} ·{" "}
        {opp.outcome === "open" ? "Em aberto" : opp.outcome === "won" ? "Convertida" : "Perdida"}
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Negociação</h3>
        <div className="field">
          <label className="label">Título</label>
          <input
            className="input"
            defaultValue={String(opp.title)}
            onBlur={(e) => void saveField({ title: e.target.value })}
          />
        </div>
        <div className="filters-row">
          <div className="field">
            <label className="label">Temperatura (oportunidade)</label>
            <select
              className="select"
              value={(opp.temperature as string) ?? ""}
              onChange={(e) =>
                void saveField({ temperature: e.target.value ? e.target.value : null })
              }
            >
              <option value="">—</option>
              {TEMP.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.l}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Responsável comercial</label>
            <select
              className="select"
              value={String(opp.owner_user_id ?? "")}
              onChange={(e) => void saveField({ owner_user_id: Number(e.target.value) })}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Closer</label>
            <select
              className="select"
              value={String(opp.closer_user_id ?? "")}
              onChange={(e) => void saveField({ closer_user_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="filters-row">
          <div className="field">
            <label className="label">Valor estimado (R$)</label>
            <input
              className="input"
              type="number"
              step="0.01"
              defaultValue={opp.estimated_value ? String(opp.estimated_value) : ""}
              disabled={Boolean(opp.estimated_value_tbd)}
              onBlur={(e) => void saveField({ estimated_value: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={Boolean(opp.estimated_value_tbd)}
              onChange={(e) => void saveField({ estimated_value_tbd: e.target.checked })}
            />
            Valor a definir
          </label>
        </div>
        <div className="field">
          <label className="label">Observações</label>
          <textarea
            className="textarea"
            defaultValue={String(opp.notes ?? "")}
            onBlur={(e) => void saveField({ notes: e.target.value || null })}
          />
        </div>
      </div>

      {data.last_approach ? (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Última abordagem (não altera etapa)</h3>
          <p>
            {(data.last_approach as Record<string, unknown>).result_name as string} —{" "}
            {formatSpDateTime(String((data.last_approach as Record<string, unknown>).occurred_at))}
          </p>
          <p className="muted">{String((data.last_approach as Record<string, unknown>).notes ?? "")}</p>
        </div>
      ) : null}

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Reuniões</h3>
        <ul>
          {((data.meetings ?? []) as Array<Record<string, unknown>>).map((m) => (
            <li key={String(m.id)}>
              {formatSpDateTime(String(m.starts_at))} — {String(m.title)}{" "}
              {m.meet_link ? (
                <a href={String(m.meet_link)} target="_blank" rel="noreferrer">
                  Meet
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {usesProposal ? (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Propostas</h3>
          <p className="muted">Arquivos privados; o envio registrado reflete o que a equipe declarou (pode ter sido fora do CRM).</p>
          <form onSubmit={uploadProposal} style={{ marginBottom: 16 }}>
            <div className="field">
              <label className="label">Arquivo (PDF, Office, imagem — máx. 15 MB)</label>
              <input className="input" type="file" name="file" required />
            </div>
            <div className="filters-row">
              <div className="field">
                <label className="label">Valor proposto (opcional)</label>
                <input className="input" type="number" step="0.01" name="proposed_value" />
              </div>
              <div className="field">
                <label className="label">Validade</label>
                <input className="input" type="date" name="valid_until" />
              </div>
            </div>
            <div className="field">
              <label className="label">Observações</label>
              <input className="input" name="notes" />
            </div>
            <button className="btn btn-primary" type="submit" disabled={uploading}>
              Anexar versão
            </button>
          </form>
          <ul>
            {proposals.map((p) => (
              <li key={String(p.id)} style={{ marginBottom: 12 }}>
                v{String(p.version_number)} — {String(p.original_filename)} ({String(p.status)}){" "}
                <a href={`/api/opportunities/${opportunityId}/proposals/${p.id}/file`}>Download</a>
                {p.status === "draft" ? (
                  <div style={{ marginTop: 8 }}>
                    <input className="input" type="date" value={sentDate} onChange={(e) => setSentDate(e.target.value)} />
                    <input
                      className="input"
                      placeholder="Canal (e-mail, WhatsApp…)"
                      value={sentChannel}
                      onChange={(e) => setSentChannel(e.target.value)}
                    />
                    <button type="button" className="btn" onClick={() => void markSent(Number(p.id))}>
                      Registrar como enviada
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Histórico de etapas</h3>
        <ul>
          {((data.stage_logs ?? []) as Array<Record<string, unknown>>).map((l) => (
            <li key={String(l.id)}>
              {formatSpDateTime(String(l.created_at))}: {String(l.from_stage_name ?? "—")} → {String(l.to_stage_name)} (
              {String(l.user_name ?? "—")})
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
