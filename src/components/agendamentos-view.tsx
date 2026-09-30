"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { FilterBar, FilterSelect } from "@/components/filter-bar";
import { MeetingsCalendar } from "@/components/meetings-calendar";
import { MeetingDetailModal, type MeetingDetailPayload } from "@/components/meeting-detail-modal";
import { MeetingFormModal } from "@/components/meeting-form-modal";
import type { ClientContact } from "@/components/client-detail-view";
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
  const [detail, setDetail] = useState<MeetingDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editContacts, setEditContacts] = useState<ClientContact[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

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
    setDetail(null);
  }, [anchorYmd, rangeKind, scope, productId, bdrUserId, status, participantUserId]);

  const visibleItems = [...items].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const selectedItem = selectedId != null ? visibleItems.find((m) => m.id === selectedId) : undefined;
  const selectedInPeriod = Boolean(selectedItem);

  useEffect(() => {
    if (!selectedInPeriod || !selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    void fetch(`/api/meetings/${selectedId}`)
      .then((r) => r.json())
      .then((d) => setDetail(d as MeetingDetailPayload))
      .finally(() => setDetailLoading(false));
  }, [selectedId, selectedInPeriod]);

  async function retrySync() {
    if (!selectedId) return;
    setSyncing(true);
    const res = await fetch(`/api/meetings/${selectedId}/sync`, { method: "POST" });
    setSyncing(false);
    if (res.ok) {
      void load();
      const d = await fetch(`/api/meetings/${selectedId}`).then((r) => r.json());
      setDetail(d as MeetingDetailPayload);
    }
  }

  function closeDetail() {
    setSelectedId(null);
    setDetail(null);
    setEditOpen(false);
  }

  async function cancelMeeting(scope: "self" | "all", reason: string) {
    if (!selectedId) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/meetings/${selectedId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, reason: reason || null })
      });
      const data = (await res.json()) as MeetingDetailPayload & { error?: string };
      if (!res.ok) {
        window.alert(data.error ?? "Não foi possível cancelar");
        return;
      }
      setDetail(data);
      void load();
    } finally {
      setCancelling(false);
    }
  }

  async function openEdit() {
    if (!selectedItem) return;
    const res = await fetch(`/api/clients/${selectedItem.client_id}/contacts`);
    const data = (await res.json()) as { contacts: ClientContact[] };
    setEditContacts(data.contacts ?? []);
    setEditOpen(true);
  }

  function onMeetingSaved() {
    setEditOpen(false);
    void load();
    if (selectedId) {
      void fetch(`/api/meetings/${selectedId}`)
        .then((r) => r.json())
        .then((d) => setDetail(d as MeetingDetailPayload));
    }
  }

  const navTitle = formatCalendarNavTitle(rangeKind, anchorYmd);

  const detailWithProduct =
    detail && selectedItem?.product_name
      ? { ...detail, meeting: { ...detail.meeting, product_name: selectedItem.product_name } }
      : detail;

  return (
    <div className="agendamentos-page">
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

      <FilterBar>
        <FilterSelect label="Produto" value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Todos</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Situação" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todas</option>
          {(Object.keys(MEETING_STATUS_LABELS) as MeetingStatus[]).map((s) => (
            <option key={s} value={s}>
              {MEETING_STATUS_LABELS[s]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="BDR" value={bdrUserId} onChange={(e) => setBdrUserId(e.target.value)}>
          <option value="">Todos</option>
          {bdrs.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Participante" value={participantUserId} onChange={(e) => setParticipantUserId(e.target.value)}>
          <option value="">Qualquer</option>
          {allUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </FilterSelect>
      </FilterBar>

      {loading ? <p className="muted">Carregando…</p> : null}

      {viewMode === "calendar" ? (
        <MeetingsCalendar
          items={visibleItems}
          rangeKind={rangeKind}
          anchorYmd={anchorYmd}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      ) : null}

      {viewMode === "list" ? (
        <div className="agendamentos-period-list">
          <MeetingsPeriodTable
            items={visibleItems}
            loading={loading}
            selectedId={selectedInPeriod ? selectedId : null}
            onSelect={setSelectedId}
          />
        </div>
      ) : null}

      <MeetingDetailModal
        open={selectedInPeriod && !editOpen}
        loading={detailLoading}
        detail={detailWithProduct}
        clientName={selectedItem?.client_name}
        onClose={closeDetail}
        onEdit={() => void openEdit()}
        onCancel={cancelMeeting}
        onRetrySync={() => void retrySync()}
        syncing={syncing}
        cancelling={cancelling}
      />

      {editOpen && selectedItem ? (
        <MeetingFormModal
          open
          onClose={() => setEditOpen(false)}
          onSaved={onMeetingSaved}
          clientId={selectedItem.client_id}
          clientName={selectedItem.client_name}
          contacts={editContacts}
          products={products}
          bdrs={bdrs}
          allUsers={allUsers}
          defaultBdrUserId={currentUserId}
          meetingId={selectedItem.id}
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
              <td>
                {m.meet_link ? (
                  <a href={m.meet_link} onClick={(e) => e.stopPropagation()}>
                    Link
                  </a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && !loading ? <p className="muted">Nenhum agendamento neste período.</p> : null}
    </div>
  );
}
