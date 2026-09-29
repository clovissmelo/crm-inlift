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

type FlowOption = { id: number; name: string };

type FilterKindOption = { value: string; label: string };

export function AdminLeadMotorSegments() {
  const [rows, setRows] = useState<SegmentRow[]>([]);
  const [filterKinds, setFilterKinds] = useState<FilterKindOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flowOptions, setFlowOptions] = useState<FlowOption[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [segRes, flowRes] = await Promise.all([
      fetch("/api/admin/lead-generation/segments"),
      fetch("/api/admin/lead-generation/flows")
    ]);
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
    if (flowRes.ok) {
      const f = (await flowRes.json()) as { flows?: Array<{ id: number; name: string }> };
      setFlowOptions((f.flows ?? []).map((x) => ({ id: x.id, name: x.name })));
    }
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
      <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Segmentos (Novos leads)</h2>
      <p className="muted" style={{ fontSize: "0.88rem" }}>
        Rótulos exibidos em Novos leads. O <strong>filtro ANP</strong> define quais postos entram em cada segmento.
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
                  <th>Fluxo padrão</th>
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
                      <select
                        className="input input-sm"
                        value={row.default_flow_id ?? ""}
                        onChange={(e) =>
                          updateRow(i, {
                            default_flow_id: e.target.value === "" ? null : Number(e.target.value)
                          })
                        }
                      >
                        <option value="">(padrão do sistema)</option>
                        {flowOptions.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
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
