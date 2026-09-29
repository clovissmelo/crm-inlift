"use client";

import Link from "next/link";
import { CadastroModal } from "@/components/cadastro-ui";
import { formatSpDateTime } from "@/lib/datetime";
import { MEETING_STATUS_LABELS, type MeetingStatus } from "@/lib/meeting-constants";

export type MeetingDetailPayload = {
  meeting: Record<string, unknown>;
  internal_participants: Array<{ id: number; name: string; email: string }>;
  external_participants: Array<{ email: string; display_name: string | null }>;
};

type Props = {
  open: boolean;
  loading: boolean;
  detail: MeetingDetailPayload | null;
  clientName?: string;
  onClose: () => void;
  onEdit: () => void;
  onRetrySync?: () => void;
  syncing?: boolean;
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
  onRetrySync,
  syncing
}: Props) {
  if (!open) return null;

  const m = detail?.meeting;
  const title = m ? String(m.title ?? "Reunião") : "";
  const status = m ? (MEETING_STATUS_LABELS[m.status as MeetingStatus] ?? String(m.status)) : "";
  const meetLink = m?.meet_link ? String(m.meet_link) : null;
  const notes = m?.notes ? String(m.notes) : null;

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

          <div className="meeting-detail-actions">
            <button type="button" className="btn btn-primary" onClick={onEdit}>
              Editar agendamento
            </button>
            <button type="button" className="btn" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </CadastroModal>
  );
}
