"use client";

import { useEffect, useState } from "react";
import { formatSpDateTime } from "@/lib/datetime";

type Item = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  occurred_at: string;
  user_name: string | null;
};

export function ClientTimeline({ clientId }: { clientId: number }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(showSpinner: boolean) {
      if (showSpinner) setLoading(true);
      const res = await fetch(`/api/clients/${clientId}/timeline`);
      if (cancelled) return;
      if (!res.ok) {
        setError("Não foi possível carregar o histórico.");
        setLoading(false);
        return;
      }
      const data = (await res.json()) as { items: Item[] };
      setItems(data.items ?? []);
      setError(null);
      setLoading(false);
    }

    void load(true);
    const t = window.setInterval(() => void load(false), 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [clientId]);

  if (loading) return <p className="muted">Carregando histórico…</p>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!items.length) return <p className="muted">Nenhum evento registrado ainda.</p>;

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {items.map((item) => (
        <li key={item.id} style={{ borderLeft: "2px solid var(--border)", paddingLeft: "0.75rem", marginBottom: "0.85rem" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
            {formatSpDateTime(item.occurred_at)}
            {item.user_name ? ` · ${item.user_name}` : ""}
          </div>
          <strong>{item.title}</strong>
          {item.detail ? <div className="muted">{item.detail}</div> : null}
        </li>
      ))}
    </ul>
  );
}
