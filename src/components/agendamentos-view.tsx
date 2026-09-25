"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { MeetingsCalendar } from "@/components/meetings-calendar";
import { MeetingFormModal } from "@/components/meeting-form-modal";
import {
  formatCalendarNavTitle,
  formatYmdInSp,
  shiftCalendarAnchor,
  type CalendarRangeKind
} from "@/lib/calendar-range";
import { formatSpDateTime } from "@/lib/datetime";
import { MEETING_STATUS_LABELS, type MeetingStatus } from "@/lib/meeting-constants";
import type { Product, User } from "@/lib/types";

type MeetingItem = {
  id: number;
  title: string;
  starts_at: string;
  duration_minutes: number;
  status: string;
  meet_link: string | null;
  google_sync_status: string;
  google_sync_error: string | null;
  client_id: number;
  client_name: string;
  product_name: string | null;
  contact_name: string | null;
  bdr_name: string;
};

type MeetingDetail = {
  meeting: Record<string, unknown>;
  internal_participants: Array<{ id: number; name: string; email: string }>;
  external_participants: Array<{ email: string; display_name: string | null }>;
};

export function AgendamentosView({
  products,
  bdrs,
  allUsers,
  currentUserId
}: {
  products: Product[];
  bdrs: User[];
  allUsers: User[];
  currentUserId: number;
}) {
  const [scope, setScope] = useState<"all" | "mine">("mine");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("calendar");
  const [rangeKind, setRangeKind] = useState<CalendarRangeKind>("week");
  const [anchorYmd, setAnchorYmd] = useState(() => formatYmdInSp());
  const [items, setItems] = useState<MeetingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [productId, setProductId] = useState("");
  const [bdrUserId, setBdrUserId] = useState("");
  const [status, setStatus] = useState("");
  const [participantUserId, setParticipantUserId] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [editClient, setEditClient] = useState<{ id: number; name: string } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ scope, range: rangeKind, date: anchorYmd });
    if (productId) params.set("product_id", productId);
    if (bdrUserId) params.set("bdr_user_id", bdrUserId);
    if (status) params.set("status", status);
    if (participantUserId) params.set("participant_user_id", participantUserId);
    const res = await fetch(`/api/meetings?${params}`);
    const data = (await res.json()) as { items: MeetingItem[] };
    setItems(data.items ?? []);
    setLoading(false);
  }, [scope, rangeKind, anchorYmd, productId, bdrUserId, status, participantUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedId(null);
  }, [anchorYmd, rangeKind, scope, productId, bdrUserId, status, participantUserId]);

  const visibleItems = [...items].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const selectedInPeriod = selectedId != null && visibleItems.some((m) => m.id === selectedId);

  useEffect(() => {
    if (!selectedInPeriod) {
      setDetail(null);
      return;
    }
    void fetch(`/api/meetings/${selectedId}`)
      .then((r) => r.json())
      .then((d) => setDetail(d as MeetingDetail));
  }, [selectedId, selectedInPeriod]);

  async function retrySync() {
    if (!selectedId) return;
    setSyncing(true);
    const res = await fetch(`/api/meetings/${selectedId}/sync`, { method: "POST" });
    setSyncing(false);
    if (res.ok) {
      void load();
      const d = await fetch(`/api/meetings/${selectedId}`).then((r) => r.json());
      setDetail(d as MeetingDetail);
    }
  }

  const navTitle = formatCalendarNavTitle(rangeKind, anchorYmd);

  return (
    <div className="agendamentos-page">
      <h1 style={{ marginTop: 0 }}>Agendamentos</h1>

      <div className="agendamentos-toolbar">
        <div className="agendamentos-toolbar-group">
          <button type="button" className={scope === "all" ? "btn btn-primary" : "btn"} onClick={() => setScope("all")}>
            Gerais
          </button>
          <button type="button" className={scope === "mine" ? "btn btn-primary" : "btn"} onClick={() => setScope("mine")}>
            Meus agendamentos
          </button>
        </div>
        <div className="agendamentos-toolbar-group">
          <button type="button" className={viewMode === "calendar" ? "btn btn-primary" : "btn"} onClick={() => setViewMode("calendar")}>
            Calendário
          </button>
          <button type="button" className={viewMode === "list" ? "btn btn-primary" : "btn"} onClick={() => setViewMode("list")}>
            Lista
          </button>
        </div>
      </div>

      <div className="meetings-cal-nav">
        <div className="meetings-cal-nav-actions">
          <button type="button" className="btn btn-icon-sm" aria-label="Período anterior" onClick={() => setAnchorYmd((d) => shiftCalendarAnchor(rangeKind, d, -1))}>
            <ChevronLeft size={18} />
          </button>
          <button type="button" className="btn btn-icon-sm" aria-label="Próximo período" onClick={() => setAnchorYmd((d) => shiftCalendarAnchor(rangeKind, d, 1))}>
            <ChevronRight size={18} />
          </button>
          <button type="button" className="btn" onClick={() => setAnchorYmd(formatYmdInSp())}>
            Hoje
          </button>
        </div>
        <h2 className="meetings-cal-nav-title">{navTitle}</h2>
        <div className="meetings-cal-range-toggle">
          {(["day", "week", "month"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className={rangeKind === kind ? "btn btn-primary" : "btn"}
              onClick={() => setRangeKind(kind)}
            >
              {kind === "day" ? "Dia" : kind === "week" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>
      </div>

      <div className="filters-row">
        <div className="field">
          <label className="label">Produto</label>
          <select className="select" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Todos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Situação</label>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas</option>
            {(Object.keys(MEETING_STATUS_LABELS) as MeetingStatus[]).map((s) => (
              <option key={s} value={s}>
                {MEETING_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">BDR</label>
          <select className="select" value={bdrUserId} onChange={(e) => setBdrUserId(e.target.value)}>
            <option value="">Todos</option>
            {bdrs.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Participante interno</label>
          <select className="select" value={participantUserId} onChange={(e) => setParticipantUserId(e.target.value)}>
            <option value="">Qualquer</option>
            {allUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? <p className="muted">Carregando…</p> : null}

      {viewMode === "calendar" ? (
        <MeetingsCalendar items={visibleItems} rangeKind={rangeKind} anchorYmd={anchorYmd} onSelect={setSelectedId} />
      ) : null}

      <div className="agendamentos-period-list" style={{ marginTop: viewMode === "calendar" ? "1.25rem" : 0 }}>
        {viewMode === "calendar" ? (
          <h3 className="agendamentos-period-list-title">Agendamentos do período</h3>
        ) : null}
        <MeetingsPeriodTable
          items={visibleItems}
          loading={loading}
          selectedId={selectedInPeriod ? selectedId : null}
          onSelect={setSelectedId}
        />
      </div>

      {selectedInPeriod && detail ? (
        <div className="panel" style={{ marginTop: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>{String(detail.meeting.title)}</h3>
          <p>
            <span className="muted">Quando:</span> {formatSpDateTime(String(detail.meeting.starts_at))} ({String(detail.meeting.duration_minutes)} min)
          </p>
          <p>
            <span className="muted">Situação:</span>{" "}
            {MEETING_STATUS_LABELS[detail.meeting.status as MeetingStatus] ?? String(detail.meeting.status)}
          </p>
          <p>
            <Link href={`/clientes/${detail.meeting.client_id}`}>Abrir cliente</Link>
            {detail.meeting.opportunity_id ? (
              <>
                {" · "}
                <span className="muted">Oportunidade #{String(detail.meeting.opportunity_id)}</span>
              </>
            ) : null}
          </p>
          <p>
            <span className="muted">Internos:</span>{" "}
            {detail.internal_participants.map((p) => `${p.name} (${p.email})`).join(", ") || "—"}
          </p>
          <p>
            <span className="muted">Externos:</span>{" "}
            {detail.external_participants.map((e) => e.email).join(", ") || "—"}
          </p>
          {detail.meeting.meet_link ? (
            <p>
              <a href={String(detail.meeting.meet_link)} target="_blank" rel="noreferrer">
                Google Meet
              </a>
            </p>
          ) : null}
          {detail.meeting.google_sync_error ? (
            <div className="alert alert-error">
              Falha na sincronização: {String(detail.meeting.google_sync_error)}
              <button type="button" className="btn" style={{ marginLeft: 8 }} disabled={syncing} onClick={() => void retrySync()}>
                Tentar novamente
              </button>
            </div>
          ) : detail.meeting.google_sync_status === "pending" || detail.meeting.google_sync_status === "error" ? (
            <button type="button" className="btn" disabled={syncing} onClick={() => void retrySync()}>
              Sincronizar com Google
            </button>
          ) : null}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                setEditClient({
                  id: Number(detail.meeting.client_id),
                  name: visibleItems.find((i) => i.id === selectedId)?.client_name ?? "Cliente"
                })
              }
            >
              Editar reunião
            </button>
            <button type="button" className="btn" onClick={() => setSelectedId(null)}>
              Fechar
            </button>
          </div>
        </div>
      ) : null}

      {editClient ? (
        <MeetingFormModal
          open
          onClose={() => setEditClient(null)}
          clientId={editClient.id}
          clientName={editClient.name}
          contacts={[]}
          products={products}
          bdrs={bdrs}
          allUsers={allUsers}
          defaultBdrUserId={currentUserId}
          meetingId={selectedId ?? undefined}
        />
      ) : null}
    </div>
  );
}

function MeetingsPeriodTable({
  items,
  loading,
  selectedId,
  onSelect
}: {
  items: MeetingItem[];
  loading: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Data/hora</th>
            <th>Título</th>
            <th>Cliente</th>
            <th>Produto</th>
            <th>Situação</th>
            <th>BDR</th>
            <th>Meet</th>
          </tr>
        </thead>
        <tbody>
          {items.map((m) => (
            <tr
              key={m.id}
              className={selectedId === m.id ? "is-selected" : undefined}
              style={{ cursor: "pointer" }}
              onClick={() => onSelect(m.id)}
            >
              <td>{formatSpDateTime(m.starts_at)}</td>
              <td>{m.title}</td>
              <td>{m.client_name}</td>
              <td>{m.product_name ?? "—"}</td>
              <td>{MEETING_STATUS_LABELS[m.status as MeetingStatus] ?? m.status}</td>
              <td>{m.bdr_name}</td>
              <td>{m.meet_link ? <a href={m.meet_link} onClick={(e) => e.stopPropagation()}>Link</a> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && !loading ? <p className="muted">Nenhum agendamento neste período.</p> : null}
    </div>
  );
}
