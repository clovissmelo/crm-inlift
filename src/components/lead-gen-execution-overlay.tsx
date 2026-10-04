"use client";

import "./lead-gen-execution.css";
import { X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { LeadGenExecutionTechPanel } from "@/components/lead-gen-execution-tech-panel";
import { sortActivityFeedDesc } from "@/lib/lead-generation/activity-feed";
import { isGoogleQuotaPauseMessage } from "@/lib/lead-generation/quota";
import { computeRunProgressPct, runProgressDetail } from "@/lib/lead-generation/run-progress";

export type LeadGenActivityLine = {
  id: number;
  label: string;
  detail: string | null;
  status: string;
  at: string;
};

type RunLike = {
  id: number;
  status: string;
  phase: string;
  uf: string;
  max_stations: number;
  progress_pct: number;
  counts_json: Record<string, number>;
  error_message: string | null;
  simulation: boolean;
  google_calls_used?: number;
  max_google_calls?: number;
  updated_at?: string;
};

const STATUS_LABEL: Record<string, string> = {
  queued: "Na fila",
  running: "Em execução",
  paused: "Pausada",
  completed: "Concluída",
  partial: "Parcial",
  failed: "Insucesso",
  cancelled: "Cancelada"
};

const PHASE_LABEL: Record<string, string> = {
  anp_load: "Carregando fonte ANP",
  processing: "Enriquecimento",
  finalizing: "Finalizando",
  done: "Concluído"
};

function ProgressBar({ run }: { run: RunLike }) {
  const pct = computeRunProgressPct(run);
  const detail = runProgressDetail(run);
  return (
    <div className="lead-gen-progress lead-gen-progress--overlay">
      <div className="lead-gen-progress-head">
        <span className="lead-gen-progress-pct">{pct}%</span>
        <span className="lead-gen-progress-detail muted">{detail}</span>
      </div>
      <div className="lead-gen-progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="lead-gen-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function activityTime(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

type Props = {
  open: boolean;
  run: RunLike;
  phaseLine: string | null;
  activity: LeadGenActivityLine[];
  cancelling: boolean;
  finalizingNow?: boolean;
  onClose: () => void;
  onCancel: () => void;
  onResume?: () => void;
  onFinalizeNow?: () => void;
  onRefresh?: () => void;
  onForceTick?: () => void;
  refreshBusy?: boolean;
  tickBusy?: boolean;
  lastRefreshedLabel?: string | null;
};

export function LeadGenExecutionOverlay({
  open,
  run,
  phaseLine,
  activity,
  cancelling,
  finalizingNow = false,
  onClose,
  onCancel,
  onResume,
  onFinalizeNow,
  onRefresh,
  onForceTick,
  refreshBusy,
  tickBusy,
  lastRefreshedLabel
}: Props) {
  const activitySorted = useMemo(() => sortActivityFeedDesc(activity), [activity]);
  const feedScrollRef = useRef<HTMLDivElement>(null);
  const lastTopActivityIdRef = useRef<number | null>(null);

  useEffect(() => {
    const topId = activitySorted[0]?.id ?? null;
    if (topId == null || topId === lastTopActivityIdRef.current) return;
    lastTopActivityIdRef.current = topId;
    feedScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [activitySorted]);

  if (!open) return null;

  const active = ["queued", "running", "paused"].includes(run.status);
  const counts = run.counts_json ?? {};

  return (
    <div className="lead-gen-overlay" role="dialog" aria-modal="true" aria-labelledby="lead-gen-overlay-title">
      <div className="lead-gen-overlay-backdrop" aria-hidden="true" onClick={onClose} />
      <div className="lead-gen-overlay-panel">
        <header className="lead-gen-overlay-head">
          <div>
            <h2 id="lead-gen-overlay-title">Geração de leads</h2>
            <p className="muted lead-gen-overlay-sub">
              {run.uf} · meta {run.max_stations} novo{run.max_stations === 1 ? "" : "s"} ·{" "}
              {STATUS_LABEL[run.status] ?? run.status}
              {active ? ` · ${PHASE_LABEL[run.phase] ?? run.phase}` : null}
              {run.simulation ? " · sem Google" : null}
            </p>
          </div>
          <button type="button" className="btn btn-icon-sm lead-gen-overlay-close" aria-label="Fechar (continua em segundo plano)" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <p className="lead-gen-overlay-bg-note" role="note">
          Ao fechar a janela, a execução não é interrompida, continua em segundo plano.
        </p>

        {active ? <ProgressBar run={run} /> : null}

        {run.error_message ? (
          isGoogleQuotaPauseMessage(run.error_message) && onFinalizeNow ? (
            <div className="lead-gen-limit-alert alert alert-error">
              <p className="lead-gen-limit-alert__text">{run.error_message}</p>
              <p className="muted lead-gen-limit-alert__hint">
                Finalize agora para concluir com os leads já gerados nesta execução ({counts.created ?? 0} novo
                {(counts.created ?? 0) === 1 ? "" : "s"}), sem precisar retomar amanhã.
              </p>
              <button
                type="button"
                className="btn btn-primary lead-gen-limit-alert__action"
                disabled={finalizingNow || cancelling}
                onClick={onFinalizeNow}
              >
                {finalizingNow ? "Finalizando…" : "Finalizar agora"}
              </button>
            </div>
          ) : (
            <p className="alert alert-error">{run.error_message}</p>
          )
        ) : null}

        <ul className="lead-gen-overlay-stats muted">
          <li>ANP: {counts.anp_found ?? 0}</li>
          <li>Itens: {counts.items_total ?? 0}</li>
          <li>Novos: {counts.created ?? 0}</li>
          <li>Já no CRM: {counts.existing ?? 0}</li>
          <li>Erros: {counts.errors ?? 0}</li>
        </ul>

        {active ? (
          <LeadGenExecutionTechPanel
            run={run}
            refreshBusy={refreshBusy}
            tickBusy={tickBusy}
            lastRefreshedLabel={lastRefreshedLabel}
            onRefresh={onRefresh}
            onForceTick={onForceTick}
          />
        ) : null}

        <div className="lead-gen-overlay-feed" ref={feedScrollRef}>
          <h3 className="lead-gen-overlay-feed-title">Atividade recente</h3>
          {phaseLine ? <p className="lead-gen-overlay-phase-line">{phaseLine}</p> : null}
          {activitySorted.length === 0 ? (
            phaseLine ? null : <p className="muted">Aguardando primeiros resultados…</p>
          ) : (
            <ul className="lead-gen-overlay-feed-list">
              {activitySorted.map((line) => (
                <li key={line.id} className={`lead-gen-feed-item lead-gen-feed-item--${line.status}`}>
                  <span className="lead-gen-feed-time">{activityTime(line.at)}</span>
                  <span className="lead-gen-feed-label">{line.label}</span>
                  {line.detail ? <span className="lead-gen-feed-detail muted">{line.detail}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {active ? (
          <footer className="lead-gen-overlay-actions">
            {run.status === "paused" && onResume ? (
              <button type="button" className="btn btn-primary" onClick={onResume}>
                Retomar
              </button>
            ) : null}
            <button
              type="button"
              className="btn lead-gen-cancel-exec-btn lead-gen-overlay-action-equal"
              disabled={cancelling}
              onClick={onCancel}
            >
              {cancelling ? "Cancelando…" : "Cancelar execução"}
            </button>
            <button type="button" className="btn lead-gen-overlay-action-equal" onClick={onClose}>
              Fechar
            </button>
          </footer>
        ) : (
          <footer className="lead-gen-overlay-actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Fechar
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
