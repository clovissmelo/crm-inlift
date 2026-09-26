"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FilterBar, FilterSelect } from "@/components/filter-bar";
import { LeadQualificationBadge } from "@/components/lead-qualification-picker";
import { formatSpDateTime } from "@/lib/datetime";
import { LEAD_QUALIFICATION_LABELS, LEAD_QUALIFICATION_ORDER, parseLeadQualification, type LeadQualification } from "@/lib/lead-qualification";
import type { Product, User } from "@/lib/types";

type FollowUpItem = {
  id: number;
  client_id: number;
  client_name: string;
  lead_qualification: string;
  contact_name: string | null;
  product_name: string | null;
  scheduled_at: string;
  notes: string | null;
  assigned_user_name: string;
  created_by_user_name: string;
  status: string;
};

type Section = "overdue" | "today" | "upcoming" | "completed";

export function RetornosView({ products, bdrs }: { products: Product[]; bdrs: User[] }) {
  const [section, setSection] = useState<Section>("overdue");
  const [items, setItems] = useState<FollowUpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{
    follow_up: { id: number; client_id: number; notes: string | null; scheduled_at: string };
    last_approach: { result_name: string | null; notes: string | null; occurred_at: string; user_name: string | null } | null;
  } | null>(null);
  const [bdrUserId, setBdrUserId] = useState("");
  const [productId, setProductId] = useState("");
  const [leadQualification, setLeadQualification] = useState<"" | LeadQualification>("");
  const [period, setPeriod] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ section, period });
    if (bdrUserId) params.set("bdr_user_id", bdrUserId);
    if (productId) params.set("product_id", productId);
    if (leadQualification) params.set("lead_qualification", leadQualification);
    const res = await fetch(`/api/follow-ups?${params}`);
    const data = (await res.json()) as { items: FollowUpItem[] };
    setItems(data.items ?? []);
    setLoading(false);
  }, [section, bdrUserId, productId, leadQualification, period]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(id: number) {
    const res = await fetch(`/api/follow-ups/${id}`);
    if (!res.ok) return;
    setDetail((await res.json()) as typeof detail);
  }

  const sections: Array<{ id: Section; label: string }> = [
    { id: "overdue", label: "Atrasados" },
    { id: "today", label: "Hoje" },
    { id: "upcoming", label: "Próximos" },
    { id: "completed", label: "Concluídos" }
  ];

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Retornos</h1>
      <div className="ui-segment" role="tablist" aria-label="Seção de retornos">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            className={section === s.id ? "ui-segment-btn is-active" : "ui-segment-btn"}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <FilterBar>
        <FilterSelect label="BDR" value={bdrUserId} onChange={(e) => setBdrUserId(e.target.value)}>
          <option value="">Todas</option>
          {bdrs.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Produto" value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Todos</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Qualificação" value={leadQualification} onChange={(e) => setLeadQualification(e.target.value as "" | LeadQualification)}>
          <option value="">Todas</option>
          {LEAD_QUALIFICATION_ORDER.map((q) => (
            <option key={q} value={q}>
              {LEAD_QUALIFICATION_LABELS[q]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Período" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="today">Hoje</option>
          <option value="yesterday">Ontem</option>
          <option value="7d">7 dias</option>
          <option value="30d">30 dias</option>
          <option value="all">Tudo</option>
        </FilterSelect>
      </FilterBar>

      {detail ? (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Retorno — {formatSpDateTime(detail.follow_up.scheduled_at)}</h3>
          {detail.last_approach ? (
            <p>
              <strong>Última abordagem:</strong> {detail.last_approach.result_name ?? "—"} ·{" "}
              {formatSpDateTime(detail.last_approach.occurred_at)} · {detail.last_approach.user_name}
              {detail.last_approach.notes ? ` — ${detail.last_approach.notes}` : ""}
            </p>
          ) : null}
          {detail.follow_up.notes ? <p className="muted">Motivo: {detail.follow_up.notes}</p> : null}
          <Link className="btn btn-primary" href={`/clientes/${detail.follow_up.client_id}?follow_up=${detail.follow_up.id}`}>
            Abrir cliente e registrar abordagem
          </Link>
          <button className="btn" type="button" style={{ marginLeft: 8 }} onClick={() => setDetail(null)}>
            Fechar
          </button>
        </div>
      ) : null}

      <div className="panel table-wrap">
        {loading ? <p className="muted">Carregando…</p> : null}
        {!loading && items.length === 0 ? <p className="muted">Nenhum retorno nesta seção.</p> : null}
        <table className="data-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Qualificação</th>
              <th>Quando</th>
              <th>Contato</th>
              <th>Produto</th>
              <th>Responsável</th>
              <th>Criado por</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link href={`/clientes/${item.client_id}?follow_up=${item.id}`}>{item.client_name}</Link>
                </td>
                <td>
                  <LeadQualificationBadge value={parseLeadQualification(item.lead_qualification)} />
                </td>
                <td>
                  <button type="button" className="btn" style={{ padding: 0, border: "none", background: "none" }} onClick={() => void openDetail(item.id)}>
                    {formatSpDateTime(item.scheduled_at)}
                  </button>
                </td>
                <td>{item.contact_name ?? "—"}</td>
                <td>{item.product_name ?? "—"}</td>
                <td>{item.assigned_user_name}</td>
                <td>{item.created_by_user_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
