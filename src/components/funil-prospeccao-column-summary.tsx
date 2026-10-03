"use client";

import Link from "next/link";
import type { Route } from "next";
import type { ProspeccaoPriorityCountRow } from "@/lib/prospeccao-query";

export function FunilProspeccaoColumnSummary({
  total,
  byPriority,
  loading
}: {
  total: number;
  byPriority: ProspeccaoPriorityCountRow[];
  loading?: boolean;
}) {
  if (loading) {
    return <p className="muted funil-prospeccao-summary">Carregando fila…</p>;
  }

  return (
    <div className="funil-prospeccao-summary">
      <p className="funil-prospeccao-summary__lead">
        <Link href={"/prospeccao" as Route} className="funil-prospeccao-summary__link">
          {total} lead{total === 1 ? "" : "s"} para contato
        </Link>
      </p>
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
      <p className="muted funil-prospeccao-summary__hint">Fila de prospecção — ligue em Leads para contato.</p>
    </div>
  );
}
