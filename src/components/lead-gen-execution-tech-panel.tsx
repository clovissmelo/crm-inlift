"use client";

import { anpLoadComplete, computeRunProgressPct } from "@/lib/lead-generation/run-progress";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

type StepState = "done" | "active" | "pending" | "error";

type TechStep = {
  id: string;
  label: string;
  detail?: string;
  state: StepState;
};

type RunLike = {
  id: number;
  status: string;
  phase: string;
  max_stations: number;
  progress_pct: number;
  google_calls_used?: number;
  max_google_calls?: number;
  updated_at?: string;
  error_message?: string | null;
  counts_json: Record<string, number | string[] | undefined>;
};

const STATUS_PT: Record<string, string> = {
  queued: "Na fila (queued)",
  running: "Em execução (running)",
  paused: "Pausada (paused)",
  completed: "Concluída",
  partial: "Parcial",
  failed: "Falhou",
  cancelled: "Cancelada"
};

const PHASE_PT: Record<string, string> = {
  anp_load: "Carregando fonte ANP (anp_load)",
  processing: "Enriquecimento (processing)",
  finalizing: "Finalizando (finalizing)",
  done: "Encerrada (done)"
};

function countNum(c: RunLike["counts_json"], key: string): number {
  const v = c[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function motorLogLines(c: RunLike["counts_json"]): string[] {
  const v = c.motor_log;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function buildTechnicalSteps(run: RunLike): TechStep[] {
  const c = run.counts_json ?? {};
  const citiesTotal = countNum(c, "cities_total");
  const citiesLoaded = countNum(c, "cities_loaded");
  const itemsTotal = countNum(c, "items_total");
  const processed = countNum(c, "processed");
  const created = countNum(c, "created");
  const googleAttempts = countNum(c, "google_api_attempts");
  const anpDone = citiesTotal > 0 && citiesLoaded >= citiesTotal;
  const terminal = ["completed", "partial", "failed", "cancelled"].includes(run.status);
  const paused = run.status === "paused";

  const motorDone = run.status !== "queued";
  const motorState: StepState = run.status === "queued" ? "active" : motorDone ? "done" : "pending";

  const anpIncompleteInProcessing =
    run.phase === "processing" &&
    !anpLoadComplete(c as unknown as import("@/lib/lead-generation/types").LeadGenCounts);
  let anpState: StepState = "pending";
  if (run.phase === "anp_load" || anpIncompleteInProcessing) anpState = paused ? "error" : "active";
  else if (anpDone || run.phase !== "anp_load") anpState = "done";

  let queueState: StepState = "pending";
  if (itemsTotal > 0) queueState = "done";
  else if (run.phase === "processing" || (anpDone && run.phase === "anp_load")) queueState = "active";

  let googleState: StepState = "pending";
  if (googleAttempts > 0 || created > 0) googleState = processed < itemsTotal && run.phase === "processing" ? "active" : "done";
  else if (run.phase === "processing" && itemsTotal > 0 && !anpIncompleteInProcessing) googleState = "active";

  let metaState: StepState = "pending";
  if (created >= run.max_stations) metaState = "done";
  else if (run.phase === "processing" && processed > 0) metaState = "active";
  if (terminal && created === 0) metaState = run.status === "failed" ? "error" : "done";

  return [
    {
      id: "register",
      label: "Execução criada no banco",
      detail: run.id > 0 ? `#${run.id}` : undefined,
      state: run.id > 0 ? "done" : "pending"
    },
    {
      id: "motor",
      label: "Motor na nuvem (POST /tick ~40s por ciclo)",
      detail: run.status === "queued" ? "Aguardando primeiro tick com aba aberta" : undefined,
      state: motorState
    },
    {
      id: "anp",
      label: "Consulta ANP por município",
      detail:
        citiesTotal > 0
          ? `${citiesLoaded}/${citiesTotal} cidades${c.last_anp_city ? ` · última: ${c.last_anp_city}` : ""}`
          : "Contando cidades da seleção…",
      state: anpState
    },
    {
      id: "queue",
      label: "Fila de postos para enriquecer",
      detail: itemsTotal > 0 ? `${itemsTotal} itens (${processed} já processados)` : "Nenhum posto enfileirado ainda",
      state: queueState
    },
    {
      id: "google",
      label: "Google Places (busca + detalhes por posto)",
      detail: `${googleAttempts} consulta(s) API · ${run.google_calls_used ?? 0}/${run.max_google_calls ?? run.max_stations} sucesso(s) na meta`,
      state: googleState
    },
    {
      id: "meta",
      label: "Gravar lead novo no CRM",
      detail: `${created}/${run.max_stations} meta`,
      state: metaState
    }
  ];
}

function formatServerTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  } catch {
    return iso;
  }
}

function StepMarker({ state }: { state: StepState }) {
  const className =
    state === "done"
      ? "lead-gen-tech-step-marker lead-gen-tech-step-marker--done"
      : state === "active"
        ? "lead-gen-tech-step-marker lead-gen-tech-step-marker--active"
        : state === "error"
          ? "lead-gen-tech-step-marker lead-gen-tech-step-marker--error"
          : "lead-gen-tech-step-marker";
  return <span className={className} aria-hidden="true" />;
}

type Props = {
  run: RunLike;
  refreshBusy?: boolean;
  lastRefreshedLabel?: string | null;
  onRefresh?: () => void;
  onForceTick?: () => void;
  tickBusy?: boolean;
};

export function LeadGenExecutionTechPanel({
  run,
  refreshBusy,
  lastRefreshedLabel,
  onRefresh,
  onForceTick,
  tickBusy
}: Props) {
  const [open, setOpen] = useState(false);
  const steps = useMemo(() => buildTechnicalSteps(run), [run]);
  const c = run.counts_json ?? {};
  const motorLog = motorLogLines(c);

  return (
    <div className="lead-gen-tech-panel">
      <div className="lead-gen-tech-panel-head">
        <button type="button" className="lead-gen-tech-toggle btn btn-sm" onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {open ? "Ocultar etapas técnicas" : "Ver mais · etapas técnicas"}
        </button>
        {onRefresh ? (
          <button
            type="button"
            className="btn btn-sm"
            disabled={refreshBusy}
            onClick={() => onRefresh()}
            title="Recarrega status do servidor (rápido)"
          >
            <RefreshCw size={14} className={refreshBusy ? "lead-gen-spin" : undefined} />
            {refreshBusy ? "Atualizando…" : "Atualizar"}
          </button>
        ) : null}
      </div>

      {lastRefreshedLabel ? <p className="muted lead-gen-tech-refreshed">Última atualização na tela: {lastRefreshedLabel}</p> : null}

      {open ? (
        <>
          <ol className="lead-gen-tech-steps">
            {steps.map((step) => (
              <li key={step.id} className={`lead-gen-tech-step lead-gen-tech-step--${step.state}`}>
                <StepMarker state={step.state} />
                <div>
                  <div className="lead-gen-tech-step-label">{step.label}</div>
                  {step.detail ? <div className="muted lead-gen-tech-step-detail">{step.detail}</div> : null}
                </div>
              </li>
            ))}
          </ol>

          <dl className="lead-gen-tech-kv muted">
            <div>
              <dt>Execução</dt>
              <dd>#{run.id}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{STATUS_PT[run.status] ?? run.status}</dd>
            </div>
            <div>
              <dt>Fase</dt>
              <dd>{PHASE_PT[run.phase] ?? run.phase}</dd>
            </div>
            <div>
              <dt>Progresso (servidor / barra)</dt>
              <dd>
                {run.progress_pct}% · barra:{" "}
                {computeRunProgressPct({
                  phase: run.phase,
                  status: run.status,
                  max_stations: run.max_stations,
                  counts_json: c as unknown as import("@/lib/lead-generation/types").LeadGenCounts
                })}
                %
              </dd>
            </div>
            <div>
              <dt>Atualizado no servidor</dt>
              <dd>{formatServerTime(run.updated_at)}</dd>
            </div>
            <div>
              <dt>ANP encontrados</dt>
              <dd>{countNum(c, "anp_found")}</dd>
            </div>
            <div>
              <dt>Pendentes / processando</dt>
              <dd>
                {countNum(c, "pending")} pendente(s) · {countNum(c, "processing")} em processamento · ticks sem
                progresso: {countNum(c, "no_progress_ticks")}
                {countNum(c, "processing") > 0 && countNum(c, "processed") === 0 ? (
                  <span className="lead-gen-tech-stuck-hint">
                    {" "}
                    (posto preso no servidor — reenfileira após ~90s ou use Forçar ciclo)
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>Sem Google / revisão</dt>
              <dd>
                {countNum(c, "no_google_match")} sem match · {countNum(c, "ambiguous")} revisão
              </dd>
            </div>
          </dl>

          {motorLog.length > 0 ? (
            <div className="lead-gen-tech-motor-log">
              <div className="lead-gen-tech-motor-log-title">Log do motor (últimos passos)</div>
              <ul className="lead-gen-tech-motor-log-lines muted">
                {motorLog.map((line, i) => (
                  <li key={`${i}-${line.slice(0, 12)}`}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {onForceTick ? (
            <button
              type="button"
              className="btn btn-sm lead-gen-tech-force-tick"
              disabled={tickBusy || refreshBusy}
              onClick={() => onForceTick()}
            >
              {tickBusy ? "Ciclo em andamento (~40s)…" : "Forçar ciclo do motor (POST /tick)"}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
