"use client";

import Link from "next/link";
import type { Route } from "next";
import type { ProspeccaoPriorityCountRow } from "@/lib/prospeccao-query";

export function FunilProspeccaoColumnSummary({
  byPriority,
  loading
}: {
  byPriority: ProspeccaoPriorityCountRow[];
  loading?: boolean;
}) {
  if (loading) {
    return <p className="muted funil-prospeccao-summary">Carregando fila…</p>;
  }

  return (
    <div className="funil-prospeccao-summary">
      <ul className="funil-prospeccao-summary__list">
        {byPriority.map((row) => (
          <li key={row.slug} className="funil-prospeccao-summary__item">
            <span className="funil-prospeccao-summary__dot" style={{ background: row.color }} aria-hidden />
            <Link
              href={`/prospeccao?prioridade=${encodeURIComponent(row.slug)}` as Route}
              className="funil-prospeccao-summary__row-link"
              title={`Ver leads — ${row.name}`}
            >
              <span className="funil-prospeccao-summary__name">{row.name}</span>
              <span className="funil-prospeccao-summary__count">{row.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
