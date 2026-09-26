"use client";

import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { useState } from "react";

export function AdminNovosLeadsWizard() {
  const [uf, setUf] = useState("");
  const [cities, setCities] = useState("");
  const [segment, setSegment] = useState("");
  const [quantity, setQuantity] = useState(20);
  const [ackCharges, setAckCharges] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    message: string;
    status: string;
    inserted: number;
    skipped_existing: number;
  } | null>(null);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!ackCharges) {
      setError("Confirme que entende que podem haver cobranças de API.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/admin/lead-discovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uf,
        cities,
        segment,
        quantity,
        acknowledge_charges: true
      })
    });
    const data = (await res.json()) as {
      error?: string;
      message?: string;
      status?: string;
      inserted?: number;
      skipped_existing?: number;
    };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Falha na busca");
      return;
    }
    setResult({
      message: data.message ?? "",
      status: data.status ?? "stub",
      inserted: data.inserted ?? 0,
      skipped_existing: data.skipped_existing ?? 0
    });
  }

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href="/admin">← Admin</Link>
      </p>
      <PageIntro>
        Busca leads via motor configurado (Google Places). Somente registros novos serão incluídos; clientes já existentes são ignorados.
      </PageIntro>

      <div className="alert" style={{ marginBottom: "1rem", borderColor: "#854d0e", background: "#292011" }}>
        <strong>Atenção:</strong> ao executar esta busca, provedores externos (Google Places etc.) podem cobrar conforme uso da API.
        Confirme abaixo antes de continuar.
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <form className="panel" onSubmit={runSearch}>
        <div className="filters-row">
          <div className="field">
            <label className="label">UF</label>
            <input className="input" maxLength={2} value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} required />
          </div>
          <div className="field">
            <label className="label">Quantidade de leads</label>
            <input
              className="input"
              type="number"
              min={1}
              max={500}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              required
            />
          </div>
        </div>
        <div className="field">
          <label className="label">Cidades (separadas por vírgula ou linha)</label>
          <textarea className="textarea" value={cities} onChange={(e) => setCities(e.target.value)} required placeholder="São Paulo, Campinas" />
        </div>
        <div className="field">
          <label className="label">Segmento / tipo de estabelecimento</label>
          <input className="input" value={segment} onChange={(e) => setSegment(e.target.value)} required placeholder="Ex.: posto de combustível" />
        </div>
        <label style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "flex-start" }}>
          <input type="checkbox" checked={ackCharges} onChange={(e) => setAckCharges(e.target.checked)} />
          <span>Entendo que valores podem ser cobrados pelas APIs utilizadas nesta consulta.</span>
        </label>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Consultando…" : "Buscar novos leads"}
        </button>
      </form>

      {result ? (
        <div className="panel" style={{ marginTop: "1rem" }}>
          <p>
            <strong>Status:</strong> {result.status}
          </p>
          <p>{result.message}</p>
          <p className="muted">
            Inseridos: {result.inserted} · Já existentes (ignorados): {result.skipped_existing}
          </p>
        </div>
      ) : null}
    </div>
  );
}
