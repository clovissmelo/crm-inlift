"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Calendar, Gem, Target } from "lucide-react";
import { FilterBar, FilterSelect } from "@/components/filter-bar";
import { LEAD_QUALIFICATION_LABELS, LEAD_QUALIFICATION_ORDER } from "@/lib/lead-qualification";
import { DashboardAnalytics } from "@/components/dashboard-analytics";
import type { Product, User } from "@/lib/types";
import "./dashboard-home.css";

type FocusItem = {
  type: "return" | "meeting";
  id: number;
  client_id: number;
  label: string;
  client_name: string;
  at: string;
  overdue: boolean;
};

type Stats = {
  clients_with_verified_phone: number;
  clients_without_approach: number;
  unique_clients_attempted: number;
  clients_reached: number;
  approaches_total: number;
  approaches_by_channel: Array<{ channel: string; count: number }>;
  approaches_timeline: {
    labels: string[];
    series: Array<{ channel: string; values: number[] }>;
  };
  call_results: Array<{ result: string; count: number }>;
  bdr_activity: Array<{ bdr_name: string; approaches: number; meetings: number; clients: number }>;
  meetings_scheduled: number;
  deals_converted: number;
  returns_overdue: number;
  returns_today: number;
  meetings_upcoming: number;
  qualification: { cold: number; warm: number; hot: number };
  focus_items: FocusItem[];
  period: string;
};

function periodFootnote(period: string) {
  if (period === "7d") return "Últimos 7 dias";
  if (period === "30d") return "Últimos 30 dias";
  if (period === "today") return "Hoje";
  if (period === "yesterday") return "Ontem";
  return "Todo o período";
}

function formatFocusTime(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

function QualDonut({ cold, warm, hot }: { cold: number; warm: number; hot: number }) {
  const total = cold + warm + hot;
  const safe = total || 1;
  const hotPct = (hot / safe) * 100;
  const warmPct = (warm / safe) * 100;
  const hotEnd = hotPct;
  const warmEnd = hotEnd + warmPct;

  const background =
    total === 0
      ? "#2d3643"
      : `conic-gradient(#f87171 0 ${hotEnd}%, #f39c12 ${hotEnd}% ${warmEnd}%, #2dd4bf ${warmEnd}% 100%)`;

  return (
    <div className="dash-donut" style={{ background }}>
      <div className="dash-donut-hole">
        <strong>{total}</strong>
        <span>clientes</span>
      </div>
    </div>
  );
}

export function DashboardView({ products, bdrs }: { products: Product[]; bdrs: User[] }) {
  const [productId, setProductId] = useState("");
  const [bdrUserId, setBdrUserId] = useState("");
  const [period, setPeriod] = useState("7d");
  const [leadQualification, setLeadQualification] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (productId) params.set("product_id", productId);
    if (bdrUserId) params.set("bdr_user_id", bdrUserId);
    if (leadQualification) params.set("lead_qualification", leadQualification);
    params.set("period", period);
    const res = await fetch(`/api/dashboard/stats?${params.toString()}`);
    if (!res.ok) {
      setError("Não foi possível carregar indicadores.");
      setLoading(false);
      return;
    }
    setStats((await res.json()) as Stats);
    setLoading(false);
  }, [productId, bdrUserId, period, leadQualification]);

  useEffect(() => {
    void load();
  }, [load]);

  const qualTotal = useMemo(() => {
    if (!stats) return 0;
    return stats.qualification.cold + stats.qualification.warm + stats.qualification.hot;
  }, [stats]);

  const periodNote = periodFootnote(period);

  return (
    <div className="dashboard-home">
      <FilterBar>
        <FilterSelect label="Produto" value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Todos</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="BDR" value={bdrUserId} onChange={(e) => setBdrUserId(e.target.value)}>
          <option value="">Todas</option>
          {bdrs.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Período" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="today">Hoje</option>
          <option value="yesterday">Ontem</option>
          <option value="7d">Últimos 7 dias</option>
          <option value="30d">Últimos 30 dias</option>
          <option value="all">Tudo</option>
        </FilterSelect>
        <FilterSelect label="Temperatura" value={leadQualification} onChange={(e) => setLeadQualification(e.target.value)}>
          <option value="">Todas</option>
          {LEAD_QUALIFICATION_ORDER.map((q) => (
            <option key={q} value={q}>
              {LEAD_QUALIFICATION_LABELS[q]}
            </option>
          ))}
        </FilterSelect>
      </FilterBar>

      {loading ? <p className="muted">Carregando…</p> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      {stats && !loading ? (
        <>
          <div className="dash-kpi-row">
            <div className="dash-kpi-card">
              <div className="dash-kpi-card-head">
                <p className="dash-kpi-title">Abordagens realizadas</p>
                <span className="dash-kpi-icon" style={{ color: "#4da6ff" }}>
                  <ArrowUpRight size={16} aria-hidden />
                </span>
              </div>
              <p className="dash-kpi-value dash-kpi-value-tone-blue">{stats.approaches_total}</p>
              <p className="dash-kpi-foot">Ligações, WhatsApp e e-mails · {periodNote}</p>
            </div>
            <div className="dash-kpi-card">
              <div className="dash-kpi-card-head">
                <p className="dash-kpi-title">Clientes contatados</p>
                <span className="dash-kpi-icon" style={{ color: "#fff" }}>
                  <Target size={16} aria-hidden />
                </span>
              </div>
              <p className="dash-kpi-value dash-kpi-value-tone-white">{stats.unique_clients_attempted}</p>
              <p className="dash-kpi-foot">Clientes únicos · {periodNote}</p>
            </div>
            <div className="dash-kpi-card">
              <div className="dash-kpi-card-head">
                <p className="dash-kpi-title">Reuniões marcadas</p>
                <span className="dash-kpi-icon" style={{ color: "#f39c12" }}>
                  <Calendar size={16} aria-hidden />
                </span>
              </div>
              <p className="dash-kpi-value dash-kpi-value-tone-orange">{stats.meetings_scheduled}</p>
              <p className="dash-kpi-foot">Agendadas · {periodNote}</p>
            </div>
            <div className="dash-kpi-card">
              <div className="dash-kpi-card-head">
                <p className="dash-kpi-title">Negócios convertidos</p>
                <span className="dash-kpi-icon" style={{ color: "#2ecc71" }}>
                  <Gem size={16} aria-hidden />
                </span>
              </div>
              <p className="dash-kpi-value dash-kpi-value-tone-green">{stats.deals_converted}</p>
              <p className="dash-kpi-foot">Fechados · {periodNote}</p>
            </div>
          </div>

          <div className="dash-mid-row">
            <section className="dash-panel">
              <div className="dash-panel-head">
                <h2>Seu foco hoje</h2>
                <Link className="dash-panel-link" href="/prospeccao">
                  Ver prospecção →
                </Link>
              </div>
              <div className="dash-focus-stats">
                <div className="dash-focus-stat dash-focus-stat-tone-red">
                  <strong>{stats.returns_overdue}</strong>
                  Retornos atrasados
                </div>
                <div className="dash-focus-stat dash-focus-stat-tone-orange">
                  <strong>{stats.returns_today}</strong>
                  Retornos para hoje
                </div>
                <div className="dash-focus-stat dash-focus-stat-tone-blue">
                  <strong>{stats.meetings_upcoming}</strong>
                  Próximas reuniões
                </div>
              </div>
              <ul className="dash-focus-list">
                {stats.focus_items.length === 0 ? (
                  <li className="muted" style={{ fontSize: "0.8125rem" }}>
                    Nada urgente para hoje com os filtros atuais.
                  </li>
                ) : (
                  stats.focus_items.map((item) => {
                    const href = (
                      item.type === "return"
                        ? `/clientes/${item.client_id}?follow_up=${item.id}`
                        : `/clientes/${item.client_id}?agendar=1`
                    ) as Route;
                    const dotColor = item.overdue ? "#f87171" : item.type === "meeting" ? "#2dd4bf" : "#f39c12";
                    return (
                      <li key={`${item.type}-${item.id}`}>
                        <Link href={href}>
                          <span className="dash-focus-list-label">
                            <span className="dash-focus-list-dot" style={{ background: dotColor }} aria-hidden />
                            <span className="dash-focus-list-text">
                              {item.label} · {item.client_name}
                            </span>
                          </span>
                          <span className="dash-focus-list-time">{formatFocusTime(item.at)}</span>
                        </Link>
                      </li>
                    );
                  })
                )}
              </ul>
            </section>

            <section className="dash-panel">
              <div className="dash-panel-head">
                <div>
                  <h2>Temperatura da carteira</h2>
                  <p className="dash-panel-sub">Estoque atual · não muda com o período</p>
                </div>
              </div>
              <div className="dash-temp-body">
                <QualDonut cold={stats.qualification.cold} warm={stats.qualification.warm} hot={stats.qualification.hot} />
                <ul className="dash-temp-legend">
                  <li>
                    <span className="dash-temp-legend-left">
                      <span className="dash-focus-list-dot" style={{ background: "#f87171" }} aria-hidden />
                      Quentes
                    </span>
                    <strong>{stats.qualification.hot}</strong>
                  </li>
                  <li>
                    <span className="dash-temp-legend-left">
                      <span className="dash-focus-list-dot" style={{ background: "#f39c12" }} aria-hidden />
                      Mornos
                    </span>
                    <strong>{stats.qualification.warm}</strong>
                  </li>
                  <li>
                    <span className="dash-temp-legend-left">
                      <span className="dash-focus-list-dot" style={{ background: "#2dd4bf" }} aria-hidden />
                      Frios
                    </span>
                    <strong>{stats.qualification.cold}</strong>
                  </li>
                </ul>
              </div>
              <p className="dash-temp-foot">Clientes quentes podem ser priorizados na lista de prospecção.</p>
            </section>
          </div>

          <section className="dash-panel">
            <div className="dash-panel-head">
              <h2>Base para trabalhar</h2>
              <Link className="dash-panel-link" href="/prospeccao">
                Ir para prospecção →
              </Link>
            </div>
            <div className="dash-base-row">
              <div className="dash-base-stat">
                <strong>{stats.clients_without_approach}</strong>
                <span>Clientes sem abordagem · estoque atual</span>
              </div>
              <div className="dash-base-stat">
                <strong>{stats.clients_with_verified_phone}</strong>
                <span>Clientes com telefone verificado · estoque atual</span>
              </div>
              <div className="dash-base-stat">
                <strong>{stats.qualification.hot}</strong>
                <span>Leads quentes para priorizar · estoque atual</span>
              </div>
            </div>
            {qualTotal === 0 ? (
              <p className="dash-temp-foot" style={{ marginTop: "0.75rem" }}>
                Cadastre clientes e use a qualificação frio/morno/quente para enriquecer esta visão.
              </p>
            ) : null}
          </section>

          <DashboardAnalytics
            data={{
              period,
              approaches_by_channel: stats.approaches_by_channel ?? [],
              approaches_timeline: stats.approaches_timeline ?? { labels: [], series: [] },
              unique_clients_attempted: stats.unique_clients_attempted,
              clients_reached: stats.clients_reached ?? 0,
              meetings_scheduled: stats.meetings_scheduled,
              deals_converted: stats.deals_converted,
              call_results: stats.call_results ?? [],
              bdr_activity: stats.bdr_activity ?? []
            }}
          />
        </>
      ) : null}
    </div>
  );
}
