"use client";

import { useEffect, useState } from "react";
import { compactTechnicalFailureLabel, isTechnicalFailureLog } from "@/lib/technical-failure-display";
import { formatSpDateTime } from "@/lib/datetime";

const TIMELINE_PAGE = 5;

type OpportunityTimelineScope = "active" | "inactive" | "all";

type Item = {
  id: string;
  kind: string;
  title: string;
  context_label?: string | null;
  detail: string | null;
  script_detail?: string | null;
  occurred_at: string;
  user_name: string | null;
  meet_link?: string | null;
};

export function ClientTimeline({ clientId }: { clientId: number }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(TIMELINE_PAGE);
  const [opportunityScope, setOpportunityScope] = useState<OpportunityTimelineScope>("active");

  useEffect(() => {
    let cancelled = false;

    async function load(showSpinner: boolean) {
      if (showSpinner) setLoading(true);
      const qs = new URLSearchParams({ opportunity_scope: opportunityScope });
      const res = await fetch(`/api/clients/${clientId}/timeline?${qs.toString()}`);
      if (cancelled) return;
      if (!res.ok) {
        setError("Não foi possível carregar o histórico.");
        setLoading(false);
        return;
      }
      const data = (await res.json()) as { items: Item[] };
      const next = data.items ?? [];
      setItems(next);
      setVisibleCount((prev) => (prev <= TIMELINE_PAGE ? TIMELINE_PAGE : Math.min(prev, next.length || TIMELINE_PAGE)));
      setError(null);
      setLoading(false);
    }

    void load(true);
    const t = window.setInterval(() => void load(false), 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [clientId, opportunityScope]);

  if (loading) return <p className="muted">Carregando histórico…</p>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!items.length) return <p className="muted">Nenhum evento registrado ainda.</p>;

  const visible = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  function renderDetail(item: Item) {
    if (!item.detail) return null;
    const forceTechnical = /falhou ao discar|falha na discagem/i.test(item.title);
    if (!forceTechnical && !isTechnicalFailureLog(item.detail)) {
      return <div className="muted client-timeline-detail">{item.detail}</div>;
    }
    const { display, fullTitle } = compactTechnicalFailureLabel(item.detail);
    return (
      <div
        className="muted client-timeline-detail client-timeline-detail--technical"
        title={fullTitle ?? item.detail}
      >
        {display}
      </div>
    );
  }

  return (
    <>
      <div className="client-timeline-toolbar" style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span className="muted" style={{ fontSize: "0.8125rem" }}>
          Oportunidades no histórico:
        </span>
        <select
          className="select input-sm"
          value={opportunityScope}
          onChange={(e) => {
            setVisibleCount(TIMELINE_PAGE);
            setOpportunityScope(e.target.value as OpportunityTimelineScope);
          }}
          aria-label="Filtrar histórico por status da oportunidade"
        >
          <option value="active">Ativas</option>
          <option value="inactive">Inativas</option>
          <option value="all">Todas</option>
        </select>
      </div>
      <ul className="client-timeline-list">
        {visible.map((item) => (
          <li key={item.id} className="client-timeline-item">
            <div className="client-timeline-item-meta">
              {formatSpDateTime(item.occurred_at)}
              {item.user_name ? ` · ${item.user_name}` : ""}
            </div>
            <strong>{item.title}</strong>
            {item.context_label ? (
              <div className="client-timeline-context">{item.context_label}</div>
            ) : null}
            {renderDetail(item)}
            {item.script_detail ? (
              <div className="muted client-timeline-script">{item.script_detail}</div>
            ) : null}
            {item.meet_link ? (
              <div style={{ marginTop: "0.25rem" }}>
                <a href={item.meet_link} target="_blank" rel="noreferrer">
                  Entrar no Google Meet
                </a>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {hasMore ? (
        <div className="client-timeline-more-wrap">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setVisibleCount((n) => Math.min(n + TIMELINE_PAGE, items.length))}
          >
            Mais
          </button>
          <span className="muted client-timeline-more-hint">
            Mostrando {visible.length} de {items.length}
          </span>
        </div>
      ) : null}
    </>
  );
}
