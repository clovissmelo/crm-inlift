"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MeetingFormModal } from "@/components/meeting-form-modal";
import { formatSpDate, formatSpDateTime } from "@/lib/datetime";
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
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [items, setItems] = useState<MeetingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("30d");
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
    const params = new URLSearchParams({ scope, period });
    if (productId) params.set("product_id", productId);
    if (bdrUserId) params.set("bdr_user_id", bdrUserId);
    if (status) params.set("status", status);
    if (participantUserId) params.set("participant_user_id", participantUserId);
    const res = await fetch(`/api/meetings?${params}`);
    const data = (await res.json()) as { items: MeetingItem[] };
    setItems(data.items ?? []);
    setLoading(false);
  }, [scope, period, productId, bdrUserId, status, participantUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void fetch(`/api/meetings/${selectedId}`)
      .then((r) => r.json())
      .then((d) => setDetail(d as MeetingDetail));
  }, [selectedId]);

  const calendarBuckets = useMemo(() => {
    const map = new Map<string, MeetingItem[]>();
    for (const m of items) {
      const key = formatSpDate(m.starts_at);
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

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

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Agendamentos</h1>
      <div className="filters-row">
        <button type="button" className={scope === "all" ? "btn btn-primary" : "btn"} onClick={() => setScope("all")}>
          Gerais
        </button>
        <button type="button" className={scope === "mine" ? "btn btn-primary" : "btn"} onClick={() => setScope("mine")}>
          Meus agendamentos
        </button>
        <button type="button" className={viewMode === "list" ? "btn btn-primary" : "btn"} onClick={() => setViewMode("list")}>
          Lista
        </button>
        <button type="button" className={viewMode === "calendar" ? "btn btn-primary" : "btn"} onClick={() => setViewMode("calendar")}>
          Calendário
        </button>
      </div>
      <div className="filters-row">
        <div className="field">
          <label className="label">Período</label>
          <select className="select" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="today">Hoje</option>
            <option value="7d">7 dias</option>
            <option value="30d">30 dias</option>
            <option value="all">Tudo</option>
          </select>
        </div>
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

      {viewMode === "list" ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Data/hora</th>
                <th>Cliente</th>
                <th>Produto</th>
                <th>Situação</th>
                <th>BDR</th>
                <th>Meet</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} style={{ cursor: "pointer" }} onClick={() => setSelectedId(m.id)}>
                  <td>{formatSpDateTime(m.starts_at)}</td>
                  <td>{m.client_name}</td>
                  <td>{m.product_name ?? "—"}</td>
                  <td>{MEETING_STATUS_LABELS[m.status as MeetingStatus] ?? m.status}</td>
                  <td>{m.bdr_name}</td>
                  <td>{m.meet_link ? <a href={m.meet_link} onClick={(e) => e.stopPropagation()}>Link</a> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && !loading ? <p className="muted">Nenhum agendamento.</p> : null}
        </div>
      ) : (
        <div>
          {calendarBuckets.map(([day, meetings]) => (
            <div key={day} className="panel" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>{day}</h3>
              <ul>
                {meetings.map((m) => (
                  <li key={m.id}>
                    <button type="button" className="btn" style={{ textAlign: "left" }} onClick={() => setSelectedId(m.id)}>
                      {formatSpDateTime(m.starts_at)} — {m.client_name} ({MEETING_STATUS_LABELS[m.status as MeetingStatus] ?? m.status})
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {calendarBuckets.length === 0 && !loading ? <p className="muted">Nenhum agendamento no período.</p> : null}
        </div>
      )}

      {selectedId && detail ? (
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
                  name: items.find((i) => i.id === selectedId)?.client_name ?? "Cliente"
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
