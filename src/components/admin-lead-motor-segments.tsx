"use client";

import { useCallback, useEffect, useState } from "react";

type SegmentRow = {
  slug: string;
  label: string;
  filter_kind: string;
  sort_order: number;
  active: boolean;
  default_flow_id: number | null;
};

type FilterKindOption = { value: string; label: string };

export function AdminLeadMotorSegments() {
  const [rows, setRows] = useState<SegmentRow[]>([]);
  const [filterKinds, setFilterKinds] = useState<FilterKindOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const segRes = await fetch("/api/admin/lead-generation/segments");
    const data = (await segRes.json()) as {
      segments?: SegmentRow[];
      filter_kinds?: FilterKindOption[];
      error?: string;
    };
    setLoading(false);
    if (!segRes.ok) {
      setError(data.error ?? "Erro ao carregar segmentos");
      return;
    }
    setRows(data.segments ?? []);
    setFilterKinds(data.filter_kinds ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updateRow(index: number, patch: Partial<SegmentRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        slug: `segmento_${prev.length + 1}`,
        label: "Novo segmento",
        filter_kind: "all",
        sort_order: (prev.length + 1) * 10,
        active: true,
        default_flow_id: null
      }
    ]);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/lead-generation/segments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segments: rows })
    });
    const data = (await res.json()) as { error?: string; segments?: SegmentRow[] };
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Erro ao salvar");
      return;
    }
    setRows(data.segments ?? rows);
    setMessage("Segmentos salvos.");
  }

  return (
    <div className="panel" style={{ marginBottom: "1rem" }}>
      <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Segmentos ANP (postos)</h2>
      <p className="muted" style={{ fontSize: "0.88rem" }}>
        Mesma lista em <strong>Novos leads</strong> e em <strong>Produtos → Segmento</strong>. O filtro ANP aplica-se à base de{" "}
        <strong>revendedores</strong>; distribuidoras e fluxo tradicional usam outras fontes conforme o fluxo do produto.
      </p>

      {loading ? <p className="muted">Carregando segmentos…</p> : null}
      {message ? <div className="alert alert-info">{message}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      {!loading ? (
        <form onSubmit={save}>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Slug</th>
                  <th>Nome na tela</th>
                  <th>Filtro ANP</th>
                  <th>Ordem</th>
                  <th>Ativo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={`${row.slug}-${i}`}>
                    <td>
                      <input
                        className="input input-sm"
                        value={row.slug}
                        onChange={(e) => updateRow(i, { slug: e.target.value.toLowerCase().replace(/\s+/g, "_") })}
                      />
                    </td>
                    <td>
                      <input
                        className="input input-sm"
                        value={row.label}
                        onChange={(e) => updateRow(i, { label: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        className="input input-sm"
                        value={row.filter_kind}
                        onChange={(e) => updateRow(i, { filter_kind: e.target.value })}
                      >
                        {filterKinds.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="input input-sm"
                        type="number"
                        min={0}
                        max={9999}
                        value={row.sort_order}
                        onChange={(e) => updateRow(i, { sort_order: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.active}
                        onChange={(e) => updateRow(i, { active: e.target.checked })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
            <button type="button" className="btn" onClick={addRow}>
              Adicionar segmento
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Salvando…" : "Salvar segmentos"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
