"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardStatsPayload } from "@/lib/dashboard-stats";
import { ArrowUpRight, Calendar, Forward, Gem, Target, UserCheck } from "lucide-react";
import { FilterBar, FilterBarButton, FilterSelect } from "@/components/filter-bar";
import {
  buildDashboardWhatsAppMessage,
  openDashboardWhatsAppShare
} from "@/lib/dashboard-whatsapp-message";
import { LeadQualificationIcon } from "@/components/lead-qualification-picker";
import { LEAD_QUALIFICATION_LABELS, LEAD_QUALIFICATION_ORDER } from "@/lib/lead-qualification";
import { DashboardAnalytics } from "@/components/dashboard-analytics";
import type { Product, User } from "@/lib/types";
import "./dashboard-home.css";

function periodFootnote(period: string) {
  if (period === "week") return "Esta semana";
  if (period === "7d") return "Últimos 7 dias";
  if (period === "30d") return "Últimos 30 dias";
  if (period === "today") return "Hoje";
  if (period === "yesterday") return "Ontem";
  return "Todo o período";
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

export function DashboardView({
  products,
  bdrs,
  initialStats = null,
  initialError = null
}: {
  products: Product[];
  bdrs: User[];
  initialStats?: DashboardStatsPayload | null;
  initialError?: string | null;
}) {
  const [productId, setProductId] = useState("");
  const [bdrUserId, setBdrUserId] = useState("");
  const [period, setPeriod] = useState("7d");
  const [leadQualification, setLeadQualification] = useState("");
  const [stats, setStats] = useState<DashboardStatsPayload | null>(initialStats);
  const [loading, setLoading] = useState(!initialStats && !initialError);
  const [error, setError] = useState<string | null>(initialError);
  const skipInitialFetch = useRef(Boolean(initialStats || initialError));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (productId) params.set("product_id", productId);
    if (bdrUserId) params.set("bdr_user_id", bdrUserId);
    if (leadQualification) params.set("lead_qualification", leadQualification);
    params.set("period", period);
    try {
      const res = await fetch(`/api/dashboard/stats?${params.toString()}`, { credentials: "same-origin" });
      const payload = (await res.json().catch(() => ({}))) as DashboardStatsPayload & { error?: string };
      if (!res.ok) {
        if (res.status === 401) {
          setError("Sessão expirada. Atualize a página ou faça login novamente.");
        } else {
          setError(payload.error ?? `Não foi possível carregar indicadores (HTTP ${res.status}).`);
        }
        setLoading(false);
        return;
      }
      setStats(payload);
    } catch {
      setError("Falha de rede ao carregar indicadores.");
    }
    setLoading(false);
  }, [productId, bdrUserId, period, leadQualification]);

  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    void load();
  }, [load]);

  const periodNote = periodFootnote(period);

  const bdrLabel = bdrUserId ? (bdrs.find((b) => String(b.id) === bdrUserId)?.name ?? "BDR") : "Todas";
  const productLabel = productId ? (products.find((p) => String(p.id) === productId)?.name ?? "Produto") : "Todos";

  function shareWhatsAppReport() {
    if (!stats?.whatsapp_report) return;
    const text = buildDashboardWhatsAppMessage(stats.whatsapp_report, {
      bdr: bdrLabel,
      product: productLabel,
      period: periodNote
    });
    openDashboardWhatsAppShare(text);
  }

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
          <option value="week">Esta semana</option>
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
        <FilterBarButton
          accent
          className="dash-wa-share-btn"
          title="Enviar fechamento comercial no WhatsApp"
          aria-label="Enviar fechamento comercial no WhatsApp"
          disabled={loading || !stats?.whatsapp_report}
          onClick={shareWhatsAppReport}
        >
          <Forward size={16} aria-hidden />
        </FilterBarButton>
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
                <p className="dash-kpi-title">Contato com decisores</p>
                <span className="dash-kpi-icon" style={{ color: "#2dd4bf" }}>
                  <UserCheck size={16} aria-hidden />
                </span>
              </div>
              <p className="dash-kpi-value dash-kpi-value-tone-teal">{stats.decision_maker_contacts}</p>
              <p className="dash-kpi-foot">Com decisor confirmado · {periodNote}</p>
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
                <h2>Base para trabalhar</h2>
                <Link className="dash-panel-link" href="/prospeccao">
                  Ir para prospecção →
                </Link>
              </div>
              <p className="dash-panel-sub" style={{ marginTop: 0 }}>
                Estoque atual · não muda com o período
              </p>
              <div className="dash-base-row dash-base-row-compact">
                <div className="dash-base-stat">
                  <strong>{stats.clients_available_for_contact}</strong>
                  <span>Clientes disponíveis para contato</span>
                </div>
                <div className="dash-base-stat">
                  <strong>{stats.pending_returns}</strong>
                  <span>Clientes para retorno</span>
                </div>
              </div>
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
                      <LeadQualificationIcon value="hot" size={16} className="lead-qual-icon--hot" />
                      Quentes
                    </span>
                    <strong>{stats.qualification.hot}</strong>
                  </li>
                  <li>
                    <span className="dash-temp-legend-left">
                      <LeadQualificationIcon value="warm" size={16} className="lead-qual-icon--warm" />
                      Mornos
                    </span>
                    <strong>{stats.qualification.warm}</strong>
                  </li>
                  <li>
                    <span className="dash-temp-legend-left">
                      <LeadQualificationIcon value="cold" size={16} className="lead-qual-icon--cold" />
                      Frios
                    </span>
                    <strong>{stats.qualification.cold}</strong>
                  </li>
                </ul>
              </div>
              <p className="dash-temp-foot">Clientes quentes podem ser priorizados na lista de prospecção.</p>
            </section>
          </div>

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
