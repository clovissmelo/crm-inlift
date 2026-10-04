"use client";

import Link from "next/link";
import { Forward } from "lucide-react";
import { useState } from "react";
import { CadastroModal } from "@/components/cadastro-ui";
import { formatSpDateTime } from "@/lib/datetime";
import { MEETING_STATUS_LABELS, type MeetingStatus } from "@/lib/meeting-constants";
import { buildMeetingWhatsAppInvite, openMeetingWhatsAppShare } from "@/lib/meeting-whatsapp-message";

export type MeetingDetailPayload = {
  meeting: Record<string, unknown>;
  internal_participants: Array<{ id: number; name: string; email: string }>;
  external_participants: Array<{
    email: string;
    display_name: string | null;
    contact_id?: number | null;
    phone?: string | null;
  }>;
};

type Props = {
  open: boolean;
  loading: boolean;
  detail: MeetingDetailPayload | null;
  clientName?: string;
  onClose: () => void;
  onEdit: () => void;
  onCancel?: (scope: "self" | "all", reason: string) => Promise<void>;
  onRetrySync?: () => void;
  syncing?: boolean;
  cancelling?: boolean;
};

function formatWhen(startsAt: string, durationMin: number): string {
  const start = formatSpDateTime(startsAt);
  const end = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(new Date(startsAt).getTime() + durationMin * 60_000));
  return `${start} · ${durationMin} min (até ${end})`;
}

export function MeetingDetailModal({
  open,
  loading,
  detail,
  clientName,
  onClose,
  onEdit,
  onCancel,
  onRetrySync,
  syncing,
  cancelling
}: Props) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [waShareHint, setWaShareHint] = useState<string | null>(null);

  if (!open) return null;

  const m = detail?.meeting;
  const title = m ? String(m.title ?? "Reunião") : "";
  const statusKey = m?.status as MeetingStatus | undefined;
  const status = m ? (MEETING_STATUS_LABELS[statusKey!] ?? String(m.status)) : "";
  const isCancelled = statusKey === "cancelled";
  const meetLink = m?.meet_link ? String(m.meet_link) : null;
  const notes = m?.notes ? String(m.notes) : null;

  async function confirmCancel(scope: "self" | "all") {
    if (!onCancel) return;
    await onCancel(scope, cancelReason.trim());
    setCancelOpen(false);
    setCancelReason("");
  }

  return (
    <CadastroModal open={open} title={loading ? "Carregando…" : title} onClose={onClose} wide>
      {loading || !detail ? (
        <p className="muted">Carregando detalhes…</p>
      ) : (
        <div className="meeting-detail">
          <div className="meeting-detail-status muted">{status}</div>

          {meetLink ? (
            <a className="meeting-detail-meet-btn" href={meetLink} target="_blank" rel="noreferrer">
              Entrar com Google Meet
            </a>
          ) : (
            <p className="muted meeting-detail-no-meet">
              Link do Meet ainda não disponível.
              {onRetrySync ? (
                <>
                  {" "}
                  <button type="button" className="link-btn" disabled={syncing} onClick={onRetrySync}>
                    {syncing ? "Sincronizando…" : "Sincronizar com Google"}
                  </button>
                </>
              ) : null}
            </p>
          )}

          {meetLink ? (
            <p className="meeting-detail-meet-url muted">
              <a href={meetLink} target="_blank" rel="noreferrer">
                {meetLink}
              </a>
            </p>
          ) : null}

          <dl className="meeting-detail-dl">
            <div>
              <dt>Quando</dt>
              <dd>{formatWhen(String(m!.starts_at), Number(m!.duration_minutes ?? 30))}</dd>
            </div>
            <div>
              <dt>Cliente</dt>
              <dd>
                <Link href={`/clientes/${m!.client_id}`}>{clientName ?? "Abrir ficha"}</Link>
              </dd>
            </div>
            {m!.product_id ? (
              <div>
                <dt>Produto</dt>
                <dd>{String(m!.product_name ?? `#${m!.product_id}`)}</dd>
              </div>
            ) : null}
          </dl>

          <section className="meeting-detail-section">
            <h4>Participantes internos</h4>
            {detail.internal_participants.length === 0 ? (
              <p className="muted">Nenhum.</p>
            ) : (
              <ul className="meeting-detail-people">
                {detail.internal_participants.map((p) => (
                  <li key={p.id}>
                    <span className="meeting-detail-person-name">{p.name}</span>
                    <span className="muted">{p.email}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="meeting-detail-section">
            <h4>Convidados externos</h4>
            {detail.external_participants.length === 0 ? (
              <p className="muted">Nenhum e-mail externo.</p>
            ) : (
              <ul className="meeting-detail-people">
                {detail.external_participants.map((e) => (
                  <li key={e.email}>
                    {e.display_name ? <span className="meeting-detail-person-name">{e.display_name} </span> : null}
                    <span className="muted">{e.email}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {notes ? (
            <section className="meeting-detail-section">
              <h4>Observações</h4>
              <p className="meeting-detail-notes">{notes}</p>
            </section>
          ) : null}

          {m!.google_sync_error ? (
            <div className="alert alert-error">
              Falha na sincronização: {String(m!.google_sync_error)}
              {onRetrySync ? (
                <button type="button" className="btn" style={{ marginLeft: 8 }} disabled={syncing} onClick={onRetrySync}>
                  Tentar novamente
                </button>
              ) : null}
            </div>
          ) : null}

          {cancelOpen ? (
            <div className="meeting-cancel-panel">
              <p className="meeting-cancel-panel-title">Como deseja cancelar?</p>
              <p className="muted meeting-cancel-panel-hint">
                <strong>Para mim</strong> remove sua participação; a reunião continua para os demais.{" "}
                <strong>Para todos</strong> cancela o agendamento no CRM e no Google Calendar.
              </p>
              <label className="label" htmlFor="meeting-cancel-reason">
                Motivo (opcional)
              </label>
              <input
                id="meeting-cancel-reason"
                className="input"
                value={cancelReason}
                disabled={cancelling}
                placeholder="Ex.: conflito de agenda"
                onChange={(e) => setCancelReason(e.target.value)}
              />
              <div className="meeting-cancel-panel-actions">
                <button type="button" className="btn" disabled={cancelling} onClick={() => void confirmCancel("self")}>
                  {cancelling ? "Cancelando…" : "Cancelar para mim"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={cancelling}
                  onClick={() => void confirmCancel("all")}
                >
                  Cancelar para todos
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={cancelling}
                  onClick={() => {
                    setCancelOpen(false);
                    setCancelReason("");
                  }}
                >
                  Voltar
                </button>
              </div>
            </div>
          ) : null}

          {waShareHint ? <p className="meeting-detail-wa-hint">{waShareHint}</p> : null}

          <div className="meeting-detail-actions">
            <button
              type="button"
              className="btn meeting-detail-wa-btn"
              title="Enviar convite no WhatsApp"
              aria-label="Enviar convite no WhatsApp"
              onClick={() => {
                void (async () => {
                  const text = buildMeetingWhatsAppInvite(detail, clientName);
                  const { copied } = await openMeetingWhatsAppShare(text);
                  if (copied) {
                    setWaShareHint("Convite copiado. No WhatsApp, cole com Ctrl+V para manter os ícones.");
                    window.setTimeout(() => setWaShareHint(null), 8000);
                  } else {
                    setWaShareHint(null);
                  }
                })();
              }}
            >
              <Forward size={16} aria-hidden />
              Encaminhar
            </button>
            <div className="meeting-detail-actions-main">
              {!isCancelled && onCancel ? (
                <button
                  type="button"
                  className="btn btn-danger-outline"
                  disabled={cancelling}
                  onClick={() => setCancelOpen(true)}
                >
                  Cancelar agenda
                </button>
              ) : null}
              {!isCancelled ? (
                <button type="button" className="btn btn-primary" onClick={onEdit}>
                  Editar agendamento
                </button>
              ) : null}
              <button type="button" className="btn" onClick={onClose}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </CadastroModal>
  );
}
