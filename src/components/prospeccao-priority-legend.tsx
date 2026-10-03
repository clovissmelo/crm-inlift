"use client";

import Link from "next/link";
import type { Route } from "next";
import { Info } from "lucide-react";
import { ProspeccaoPriorityBadge } from "@/components/prospeccao-priority-badge";
import {
  prospeccaoPriorityLegendText,
  type ProspeccaoPriorityLegendItem
} from "@/lib/prospeccao-priority-legend-text";

export function ProspeccaoPriorityLegend({
  priorities,
  activeSlug,
  onSelectSlug
}: {
  priorities: ProspeccaoPriorityLegendItem[];
  activeSlug?: string;
  /** Slug vazio remove o filtro. */
  onSelectSlug?: (slug: string) => void;
}) {
  return (
    <div className="prospeccao-priority-legend-trigger">
      <button
        type="button"
        className="btn prospeccao-priority-legend-btn"
        aria-describedby="prospeccao-priority-legend-popover"
      >
        <Info size={16} aria-hidden />
        Prioridades
      </button>
      <div
        id="prospeccao-priority-legend-popover"
        className="prospeccao-priority-legend-popover panel"
        role="tooltip"
        aria-label="Legenda de prioridades"
      >
        <h2 className="prospeccao-priority-legend__title">Prioridades</h2>
        <p className="muted prospeccao-priority-legend__intro">
          Ordem de ligação e significado de cada faixa. Textos vêm do cadastro em{" "}
          <Link href={"/admin/prospeccao?tab=queue" as Route}>Prospecção → Fila</Link>.
        </p>
        <ul className="prospeccao-priority-legend__list">
          {priorities.map((p) => {
            const text = prospeccaoPriorityLegendText(p);
            const isActive = activeSlug === p.slug;
            return (
              <li key={p.id ?? p.slug} className="prospeccao-priority-legend__item">
                {onSelectSlug ? (
                  <button
                    type="button"
                    className={`prospeccao-priority-legend__row${isActive ? " prospeccao-priority-legend__row--active" : ""}`}
                    onClick={() => onSelectSlug(isActive ? "" : p.slug)}
                    title={`Filtrar por ${p.name}`}
                  >
                    <ProspeccaoPriorityBadge label={p.name} color={p.color} />
                    <span className="prospeccao-priority-legend__text">{text}</span>
                  </button>
                ) : (
                  <div className="prospeccao-priority-legend__row">
                    <ProspeccaoPriorityBadge label={p.name} color={p.color} />
                    <span className="prospeccao-priority-legend__text">{text}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
