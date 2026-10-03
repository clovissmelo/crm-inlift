"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProspeccaoPriorityTypeRow } from "@/lib/call-strategy/priorities-config";
import { ruleKindSummary } from "@/lib/prospeccao-priority-queue-admin";

function sortBySortOrder(rows: ProspeccaoQueuePrioritySummary[]): ProspeccaoQueuePrioritySummary[] {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

export type ProspeccaoQueuePrioritySummary = Pick<
  ProspeccaoPriorityTypeRow,
  | "id"
  | "slug"
  | "name"
  | "description"
  | "color"
  | "sort_order"
  | "rule_kind"
  | "rule_params"
  | "queue_anchor"
>;

export function ProspeccaoQueueOrderSummary({
  priorities,
  canEdit,
  onOrderSaved
}: {
  priorities: ProspeccaoQueuePrioritySummary[];
  canEdit: boolean;
  onOrderSaved?: () => void;
}) {
  const [rows, setRows] = useState(priorities);
  const [countsBySlug, setCountsBySlug] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRows(priorities);
  }, [priorities]);

  useEffect(() => {
    void fetch("/api/prospeccao/priority-counts")
      .then((r) => r.json())
      .then((data: { byPriority?: Array<{ slug: string; count: number }> }) => {
        const map: Record<string, number> = {};
        for (const row of data.byPriority ?? []) {
          map[row.slug] = row.count;
        }
        setCountsBySlug(map);
      })
      .catch(() => {});
  }, []);

  const sorted = useMemo(() => sortBySortOrder(rows), [rows]);

  const saveAll = useCallback(async () => {
    setSaving(true);
    setMsg(null);
    const results = await Promise.all(
      rows.map((row) =>
        fetch("/api/admin/prospeccao-priorities", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: row.id,
            sort_order: row.sort_order
          })
        })
      )
    );
    setSaving(false);
    if (results.some((r) => !r.ok)) {
      setMsg("Não foi possível salvar a ordem. Tente novamente.");
      return;
    }
    const lastOk = results.find((r) => r.ok);
    if (lastOk) {
      const j = (await lastOk.json()) as { items: ProspeccaoPriorityTypeRow[] };
      setRows(
        j.items.map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          description: p.description,
          color: p.color,
          sort_order: p.sort_order,
          rule_kind: p.rule_kind,
          rule_params: p.rule_params ?? null,
          queue_anchor: p.queue_anchor ?? "none"
        }))
      );
    }
    setMsg("Ordem de ligação atualizada.");
    onOrderSaved?.();
  }, [rows, onOrderSaved]);

  return (
    <details className="panel prospeccao-queue-order-summary" open>
      <summary className="prospeccao-queue-order-summary__head">
        <span>Ordem de ligação</span>
        <span className="muted prospeccao-queue-order-summary__hint">
          Menor número = liga antes. A tabela abaixo segue esta ordem (de cima para baixo).
        </span>
      </summary>

      {msg ? <p className="prospeccao-queue-order-summary__msg">{msg}</p> : null}

      <ol className="prospeccao-queue-order-summary__list">
        {sorted.map((p) => {
          const count = p.slug ? countsBySlug[p.slug] : undefined;
          return (
            <li key={p.id} className="prospeccao-queue-order-summary__item">
              <span className="prospeccao-queue-order-summary__dot" style={{ background: p.color }} aria-hidden />
              <div className="prospeccao-queue-order-summary__main">
                <span className="prospeccao-queue-order-summary__name">{p.name}</span>
                <span className="muted prospeccao-queue-order-summary__rule">
                  {ruleKindSummary(p as ProspeccaoPriorityTypeRow)}
                </span>
              </div>
              {typeof count === "number" ? (
                <span className="muted prospeccao-queue-order-summary__count" title="Leads na fila agora">
                  {count}
                </span>
              ) : null}
              {canEdit ? (
                <label className="prospeccao-queue-order-summary__ord-field">
                  <span className="muted">Ordem</span>
                  <input
                    className="input prospeccao-queue-order-summary__ord-input"
                    type="number"
                    min={1}
                    max={999_999}
                    title="Quanto menor, liga antes na fila"
                    value={p.sort_order}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (!Number.isFinite(n)) return;
                      setRows((list) =>
                        list.map((r) => (r.id === p.id ? { ...r, sort_order: n } : r))
                      );
                    }}
                  />
                </label>
              ) : (
                <span className="muted prospeccao-queue-order-summary__order">ordem {p.sort_order}</span>
              )}
            </li>
          );
        })}
      </ol>

      <p className="muted prospeccao-queue-order-summary__foot">
        Retornos vencidos sobem na fila. Retorno agendado fica por último até a data.
      </p>

      {canEdit ? (
        <div className="prospeccao-queue-order-summary__actions">
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => void saveAll()}>
            {saving ? "Salvando…" : "Salvar ordem"}
          </button>
          <Link className="btn btn-sm" href={"/admin/prospeccao?tab=queue" as Route}>
            Regras e novas prioridades
          </Link>
        </div>
      ) : null}
    </details>
  );
}
