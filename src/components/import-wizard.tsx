"use client";

import { useState } from "react";
import type { ImportColumnKey } from "@/lib/import-spreadsheet";
import { PageIntro } from "@/components/page-intro";
import type { Product, User } from "@/lib/types";

const FIELD_OPTIONS: Array<{ value: ImportColumnKey; label: string }> = [
  { value: "skip", label: "Ignorar coluna" },
  { value: "cnpj", label: "CNPJ" },
  { value: "legal_name", label: "Razão social" },
  { value: "trade_name", label: "Nome fantasia" },
  { value: "segment", label: "Segmento" },
  { value: "city", label: "Cidade" },
  { value: "uf", label: "UF" },
  { value: "address", label: "Endereço" },
  { value: "website", label: "Site" },
  { value: "instagram", label: "Instagram" },
  { value: "notes", label: "Observações" },
  { value: "contact_name", label: "Contato — nome" },
  { value: "contact_phone", label: "Contato — telefone" },
  { value: "contact_whatsapp", label: "Contato — telefone adicional" },
  { value: "contact_email", label: "Contato — e-mail" }
];

export function ImportWizard({ products, bdrs }: { products: Product[]; bdrs: User[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<Array<Record<string, string>>>([]);
  const [mapping, setMapping] = useState<Record<string, ImportColumnKey>>({});
  const [defaultProductId, setDefaultProductId] = useState("");
  const [defaultBdrUserId, setDefaultBdrUserId] = useState("");
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: Array<{ row: number; message: string }>;
    possibleDuplicates: Array<{ row: number; trade_name: string; city: string | null }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setResult(null);
    setError(null);
    setLoading(true);
    const form = new FormData();
    form.append("file", selected);
    const res = await fetch("/api/import/preview", { method: "POST", body: form });
    const data = (await res.json()) as {
      error?: string;
      headers?: string[];
      preview?: Array<Record<string, string>>;
    };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Falha na leitura");
      return;
    }
    const hdrs = data.headers ?? [];
    setHeaders(hdrs);
    setPreview(data.preview ?? []);
    const initial: Record<string, ImportColumnKey> = {};
    hdrs.forEach((h) => {
      initial[h] = "skip";
    });
    setMapping(initial);
  }

  async function execute() {
    if (!file) return;
    setLoading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("mapping", JSON.stringify(mapping));
    if (defaultProductId) form.append("default_product_id", defaultProductId);
    if (defaultBdrUserId) form.append("default_bdr_user_id", defaultBdrUserId);
    const res = await fetch("/api/import/execute", { method: "POST", body: form });
    const data = (await res.json()) as { error?: string; result?: typeof result };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Falha na importação");
      return;
    }
    setResult(data.result ?? null);
  }

  return (
    <div>
      <PageIntro>Arquivos .xlsx ou .csv. O sistema registra nome do arquivo e data da importação.</PageIntro>

      <div className="panel">
        <div className="field">
          <label className="label">Arquivo</label>
          <input className="input" type="file" accept=".xlsx,.csv" onChange={onFileChange} />
        </div>
        <div className="filters-row">
          <div className="field">
            <label className="label">Produto padrão</label>
            <select className="select" value={defaultProductId} onChange={(e) => setDefaultProductId(e.target.value)}>
              <option value="">Nenhum</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">BDR padrão</label>
            <select className="select" value={defaultBdrUserId} onChange={(e) => setDefaultBdrUserId(e.target.value)}>
              <option value="">Nenhuma</option>
              {bdrs.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? <p className="muted">Processando…</p> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      {headers.length > 0 ? (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Mapeamento de colunas</h3>
          {headers.map((header) => (
            <div className="field" key={header}>
              <label className="label">{header}</label>
              <select
                className="select"
                value={mapping[header] ?? "skip"}
                onChange={(e) => setMapping((m) => ({ ...m, [header]: e.target.value as ImportColumnKey }))}
              >
                {FIELD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <button className="btn btn-primary" type="button" onClick={() => void execute()} disabled={!file || loading}>
            Importar
          </button>
        </div>
      ) : null}

      {preview.length > 0 ? (
        <div className="panel table-wrap">
          <h3 style={{ marginTop: 0 }}>Prévia (até 20 linhas)</h3>
          <table className="data-table">
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, idx) => (
                <tr key={idx}>
                  {headers.map((h) => (
                    <td key={h}>{row[h]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {result ? (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Resultado</h3>
          <p>Criados: {result.created}</p>
          <p>Atualizados: {result.updated}</p>
          <p>Ignorados: {result.skipped}</p>
          <p>Linhas com erro: {result.errors.length}</p>
          {result.possibleDuplicates.length > 0 ? (
            <>
              <p className="muted">Possíveis duplicidades (sem CNPJ) para revisão:</p>
              <ul>
                {result.possibleDuplicates.slice(0, 20).map((d) => (
                  <li key={d.row}>
                    Linha {d.row}: {d.trade_name} {d.city ? `— ${d.city}` : ""}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {result.errors.length > 0 ? (
            <ul>
              {result.errors.slice(0, 10).map((e) => (
                <li key={e.row}>
                  Linha {e.row}: {e.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
