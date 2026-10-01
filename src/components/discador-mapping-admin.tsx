"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CadastroModal, CadastroPageHeader } from "@/components/cadastro-ui";

type TechnicalRow = {
  id: number;
  slug: string;
  display_name: string;
  provider_rules: unknown;
  sort_order: number;
  status: string;
  answered?: boolean;
};

type FlatMapping = {
  key: string;
  technical_id: number;
  technical_name: string;
  technical_slug: string;
  answered: boolean;
  code: string | null;
  label: string | null;
  kind: string;
};

function flattenProviderRules(items: TechnicalRow[]): FlatMapping[] {
  const rows: FlatMapping[] = [];
  for (const t of items) {
    const rules = Array.isArray(t.provider_rules) ? t.provider_rules : [];
    if (rules.length === 0) {
      rows.push({
        key: `${t.id}-empty`,
        technical_id: t.id,
        technical_name: t.display_name,
        technical_slug: t.slug,
        answered: Boolean(t.answered),
        code: null,
        label: null,
        kind: "—"
      });
      continue;
    }
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i] as Record<string, unknown>;
      if (rule.kind === "answered") {
        rows.push({
          key: `${t.id}-answered-${i}`,
          technical_id: t.id,
          technical_name: t.display_name,
          technical_slug: t.slug,
          answered: true,
          code: null,
          label: "Sinal de atendimento (answered_at / duração)",
          kind: "answered"
        });
        continue;
      }
      const codes = Array.isArray(rule.codes) ? (rule.codes as string[]) : [];
      const labels = Array.isArray(rule.labels) ? (rule.labels as string[]) : [];
      const max = Math.max(codes.length, labels.length, 1);
      for (let j = 0; j < max; j++) {
        rows.push({
          key: `${t.id}-${i}-${j}`,
          technical_id: t.id,
          technical_name: t.display_name,
          technical_slug: t.slug,
          answered: Boolean(t.answered),
          code: codes[j] ?? null,
          label: labels[j] ?? null,
          kind: "provider"
        });
      }
    }
  }
  return rows;
}

export function DiscadorMappingAdmin({ embedded = false }: { embedded?: boolean }) {
  const [items, setItems] = useState<TechnicalRow[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TechnicalRow | null>(null);
  const [form, setForm] = useState({ display_name: "", provider_rules: "[]", sort_order: "0", status: "active" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/call-technical-result-types");
    const data = (await res.json()) as { items?: TechnicalRow[] };
    setItems(data.items ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flat = useMemo(() => flattenProviderRules(items), [items]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return flat;
    return flat.filter(
      (r) =>
        r.code?.toLowerCase().includes(q) ||
        r.label?.toLowerCase().includes(q) ||
        r.technical_name.toLowerCase().includes(q) ||
        r.technical_slug.toLowerCase().includes(q)
    );
  }, [flat, search]);

  function openEdit(row: TechnicalRow) {
    setEditing(row);
    setForm({
      display_name: row.display_name,
      provider_rules: JSON.stringify(row.provider_rules ?? [], null, 2),
      sort_order: String(row.sort_order),
      status: row.status
    });
    setError(null);
    setOpen(true);
  }

  async function save() {
    if (!editing) return;
    setError(null);
    let rules: unknown;
    try {
      rules = JSON.parse(form.provider_rules);
    } catch {
      setError("JSON de mapeamento inválido.");
      return;
    }
    const res = await fetch(`/api/call-technical-result-types/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: form.display_name,
        provider_rules: rules,
        sort_order: Number(form.sort_order),
        status: form.status
      })
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Erro ao salvar");
      return;
    }
    setOpen(false);
    void load();
  }

  return (
    <>
      {embedded ? null : (
        <CadastroPageHeader title="Mapeamento do discador" onNew={() => {}} newLabel="" />
      )}
      <p className="muted" style={{ marginTop: embedded ? 0 : undefined, maxWidth: "42rem" }}>
        Códigos e rótulos técnicos da <strong>API4COM</strong> apontam para um <strong>resultado da ligação</strong>. O{" "}
        atendimento (Atendeu / Não atendeu) vem desse resultado — regras comerciais ficam em{" "}
        <Link href="/resultado-comercial">Resultado comercial → Matriz de fluxo operacional</Link>.
      </p>
      <div className="result-assoc-toolbar">
        <input
          className="input"
          placeholder="Buscar código, rótulo ou resultado…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar mapeamentos"
        />
      </div>
      <div className="panel table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Código técnico</th>
              <th>Nome / rótulo</th>
              <th>Resultado da ligação</th>
              <th>Atendimento</th>
              <th style={{ width: 100 }} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.key}>
                <td>{r.code ? <code>{r.code}</code> : <span className="muted">—</span>}</td>
                <td>{r.label ?? <span className="muted">—</span>}</td>
                <td>{r.technical_name}</td>
                <td>
                  <span className={`result-assoc-badge result-assoc-badge--${r.answered ? "yes" : "no"}`}>
                    {r.answered ? "Atendeu" : "Não atendeu"}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      const tech = items.find((t) => t.id === r.technical_id);
                      if (tech) openEdit(tech);
                    }}
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CadastroModal open={open} title={`Editar mapeamento — ${editing?.display_name ?? ""}`} onClose={() => setOpen(false)} wide>
        {error ? <div className="alert alert-error">{error}</div> : null}
        <div className="field">
          <label className="label">Nome exibido (resultado da ligação)</label>
          <input className="input" value={form.display_name} onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))} />
        </div>
        <div className="field">
          <label className="label">Atendimento</label>
          <p className="muted" style={{ margin: 0 }}>
            {editing?.answered ? "Atendeu" : "Não atendeu"} (definido pelo slug <code>{editing?.slug}</code>)
          </p>
        </div>
        <div className="field">
          <label className="label">Regras JSON (códigos / rótulos do provedor)</label>
          <textarea
            className="textarea"
            rows={12}
            value={form.provider_rules}
            onChange={(e) => setForm((f) => ({ ...f, provider_rules: e.target.value }))}
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label className="label">Ordem</label>
            <input className="input" type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} />
          </div>
          <div className="field">
            <label className="label">Status</label>
            <select className="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-primary" onClick={() => void save()}>
            Salvar
          </button>
        </div>
      </CadastroModal>
    </>
  );
}
