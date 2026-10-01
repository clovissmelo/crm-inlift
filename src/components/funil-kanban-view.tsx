"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { APPROACH_NEXT_ACTION_LABELS, type ApproachNextActionKey } from "@/lib/approach-next-actions";
import { formatSpDateTime } from "@/lib/datetime";
import {
  parsePipelineStageEnterRules,
  stageEnterPromptRequired,
  type PipelineStageEnterRules,
  type StageEnterActionPayload
} from "@/lib/pipeline-stage-enter";
import { FilterBar, FilterInput, FilterSelect } from "@/components/filter-bar";
import { PageIntro } from "@/components/page-intro";
import type { Product, User } from "@/lib/types";

type Stage = {
  id: number;
  name: string;
  sort_order: number;
  color: string;
  kind: string;
  enter_collect_notes?: boolean;
  enter_allowed_next_actions?: string | null;
  enter_require_next_action?: boolean;
};
type Card = {
  id: number;
  title: string;
  client_id: number;
  product_id: number;
  client_name: string;
  product_name: string;
  uses_proposal: boolean;
  origin_bdr_name: string | null;
  owner_name: string | null;
  closer_name: string | null;
  temperature: string | null;
  estimated_value: string | null;
  estimated_value_tbd: boolean;
  next_action_at: string | null;
  pipeline_stage_id: number;
  row_version: number;
};

const TEMP_LABEL: Record<string, string> = { cold: "Frio", warm: "Morno", hot: "Quente" };

function spInputToIso(date: string, time: string) {
  return new Date(`${date}T${time}:00-03:00`).toISOString();
}

type MoveModalState = {
  card: Card;
  toStageId: number;
  mode: "enter" | "won" | "lost";
  enterRules?: PipelineStageEnterRules;
  targetStageName?: string;
};

export function FunilKanbanView({ products, bdrs, users }: { products: Product[]; bdrs: User[]; users: User[] }) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    product_id: "",
    origin_bdr_user_id: "",
    owner_user_id: "",
    closer_user_id: "",
    temperature: "",
    city: "",
    uf: "",
    period: "all"
  });
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  const advancedFiltersActive = Boolean(
    filters.origin_bdr_user_id || filters.city || filters.uf || filters.period !== "all"
  );
  const [moveModal, setMoveModal] = useState<MoveModalState | null>(null);
  const [lostReasonId, setLostReasonId] = useState("");
  const [lostNotes, setLostNotes] = useState("");
  const [closerId, setCloserId] = useState("");
  const [closedAt, setClosedAt] = useState("");
  const [dealValue, setDealValue] = useState("");
  const [dealValueTbd, setDealValueTbd] = useState(false);
  const [lossReasons, setLossReasons] = useState<Array<{ id: number; name: string }>>([]);
  const [pauseReasons, setPauseReasons] = useState<Array<{ id: number; name: string }>>([]);
  const [enterNotes, setEnterNotes] = useState("");
  const [enterNextType, setEnterNextType] = useState<"" | StageEnterActionPayload["type"]>("");
  const [enterNextDate, setEnterNextDate] = useState("");
  const [enterNextTime, setEnterNextTime] = useState("");
  const [enterPauseReasonId, setEnterPauseReasonId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ period: filters.period });
    Object.entries(filters).forEach(([k, v]) => {
      if (k !== "period" && v) params.set(k, v);
    });
    const res = await fetch(`/api/opportunities/kanban?${params}`);
    if (!res.ok) {
      setError("Não foi possível carregar o funil.");
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { stages: Stage[]; cards: Card[] };
    setStages(data.stages.filter((s) => s.kind === "in_progress"));
    setCards(data.cards);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    void load();
    void fetch("/api/opportunity-loss-reasons").then((r) =>
      r.json().then((d) => setLossReasons((d as { items: Array<{ id: number; name: string }> }).items.filter((i) => i.id)))
    );
    void fetch("/api/closure-reason-types").then((r) =>
      r.json().then((d) =>
        setPauseReasons(
          (d as { items: Array<{ id: number; name: string; kind: string }> }).items.filter(
            (i) => i.id && i.kind === "pause"
          )
        )
      )
    );
  }, [load]);

  function resetEnterForm() {
    setEnterNotes("");
    setEnterNextType("");
    setEnterNextDate("");
    setEnterNextTime("");
    setEnterPauseReasonId("");
  }

  function beginStageMove(card: Card, toStageId: number, terminalKind?: string) {
    if (card.pipeline_stage_id === toStageId) return;

    if (terminalKind === "won" || terminalKind === "lost") {
      resetEnterForm();
      setMoveModal({ card, toStageId, mode: terminalKind });
      return;
    }

    const target = stages.find((s) => s.id === toStageId);
    if (target) {
      const rules = parsePipelineStageEnterRules(target);
      if (stageEnterPromptRequired(rules)) {
        resetEnterForm();
        setMoveModal({
          card,
          toStageId,
          mode: "enter",
          enterRules: rules,
          targetStageName: target.name
        });
        return;
      }
      void moveCard(card, toStageId);
      return;
    }

    void fetch("/api/pipeline-stages?all=1")
      .then((r) => r.json())
      .then((d) => {
        const st = (d as { items: Stage[] }).items.find((s) => s.id === toStageId);
        if (st?.kind === "won" || st?.kind === "lost") {
          beginStageMove(card, toStageId, st.kind);
        } else if (st) {
          const rules = parsePipelineStageEnterRules(st);
          if (stageEnterPromptRequired(rules)) {
            resetEnterForm();
            setMoveModal({
              card,
              toStageId,
              mode: "enter",
              enterRules: rules,
              targetStageName: st.name
            });
          } else {
            void moveCard(card, toStageId);
          }
        }
      });
  }

  useEffect(() => {
    if (advancedFiltersActive) setMoreFiltersOpen(true);
  }, [advancedFiltersActive]);

  const byStage = useMemo(() => {
    const map = new Map<number, Card[]>();
    for (const s of stages) map.set(s.id, []);
    for (const c of cards) {
      const list = map.get(c.pipeline_stage_id) ?? [];
      list.push(c);
      map.set(c.pipeline_stage_id, list);
    }
    return map;
  }, [cards, stages]);

  async function moveCard(card: Card, toStageId: number, extra?: Record<string, unknown>) {
    const res = await fetch(`/api/opportunities/${card.id}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_stage_id: toStageId, expected_version: card.row_version, ...extra })
    });
    if (res.status === 409) {
      setError("Conflito de edição — recarregando funil.");
      void load();
      return;
    }
    if (!res.ok) {
      const d = (await res.json()) as { error?: string };
      setError(d.error ?? "Erro ao mover");
      return;
    }
    setMoveModal(null);
    void load();
  }

  function onDropStage(e: React.DragEvent, stageId: number) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/x-opp-card");
    if (!raw) return;
    const card = JSON.parse(raw) as Card;
    beginStageMove(card, stageId);
  }

  function handleDragStart(e: React.DragEvent, card: Card) {
    e.dataTransfer.setData("application/x-opp-card", JSON.stringify(card));
  }

  async function confirmSpecialMove() {
    if (!moveModal) return;
    if (moveModal.mode === "lost") {
      await moveCard(moveModal.card, moveModal.toStageId, {
        lost_reason_id: Number(lostReasonId),
        lost_notes: lostNotes || null
      });
      return;
    }
    if (moveModal.mode === "won") {
      await moveCard(moveModal.card, moveModal.toStageId, {
        conversion: {
          closer_user_id: Number(closerId),
          closed_at: new Date(`${closedAt}T12:00:00-03:00`).toISOString(),
          deal_value: dealValueTbd ? null : dealValue ? Number(dealValue) : null,
          deal_value_tbd: dealValueTbd
        }
      });
      return;
    }
    if (moveModal.mode === "enter" && moveModal.enterRules) {
      const extra: Record<string, unknown> = {};
      if (moveModal.enterRules.enter_collect_notes) {
        extra.enter_notes = enterNotes.trim();
      }
      if (enterNextType) {
        const action: StageEnterActionPayload = { type: enterNextType };
        if (enterNextType === "schedule_return" || enterNextType === "schedule_meeting") {
          action.scheduled_at = spInputToIso(enterNextDate, enterNextTime);
        }
        if (enterNextType === "pause") {
          action.reason_id = Number(enterPauseReasonId);
        }
        extra.enter_action = action;
      }
      await moveCard(moveModal.card, moveModal.toStageId, extra);
    }
  }

  return (
    <div>
      <PageIntro>Arraste os cartões entre etapas ou para fechamento relacionado.</PageIntro>
      <div className="client-filters-block">
        <FilterBar>
          <FilterSelect
            label="Produto"
            value={filters.product_id}
            onChange={(e) => setFilters((f) => ({ ...f, product_id: e.target.value }))}
          >
            <option value="">Todos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Responsável"
            value={filters.owner_user_id}
            onChange={(e) => setFilters((f) => ({ ...f, owner_user_id: e.target.value }))}
          >
            <option value="">Todos</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Closer"
            value={filters.closer_user_id}
            onChange={(e) => setFilters((f) => ({ ...f, closer_user_id: e.target.value }))}
          >
            <option value="">Todos</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Temperatura"
            value={filters.temperature}
            onChange={(e) => setFilters((f) => ({ ...f, temperature: e.target.value }))}
          >
            <option value="">Todas</option>
            <option value="cold">Frio</option>
            <option value="warm">Morno</option>
            <option value="hot">Quente</option>
          </FilterSelect>
        </FilterBar>

        <div className="client-filters-more-toggle-wrap">
          <button
            type="button"
            className={`client-filters-more-toggle${moreFiltersOpen ? " is-open" : ""}`}
            aria-expanded={moreFiltersOpen}
            onClick={() => setMoreFiltersOpen((o) => !o)}
          >
            <span className="client-filters-more-toggle__chev" aria-hidden />
            <span className="client-filters-more-toggle__label">
              {moreFiltersOpen ? "menos filtros" : "mais filtros"}
              {!moreFiltersOpen && advancedFiltersActive ? " · ativos" : null}
            </span>
          </button>
        </div>

        {moreFiltersOpen ? (
          <FilterBar className="client-filters-more-row">
            <FilterSelect
              label="BDR origem"
              value={filters.origin_bdr_user_id}
              onChange={(e) => setFilters((f) => ({ ...f, origin_bdr_user_id: e.target.value }))}
            >
              <option value="">Todos</option>
              {bdrs.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </FilterSelect>
            <FilterInput
              label="Cidade"
              value={filters.city}
              onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}
              placeholder="—"
            />
            <FilterInput
              label="UF"
              maxLength={2}
              value={filters.uf}
              onChange={(e) => setFilters((f) => ({ ...f, uf: e.target.value }))}
              placeholder="—"
            />
            <FilterSelect
              label="Período"
              value={filters.period}
              onChange={(e) => setFilters((f) => ({ ...f, period: e.target.value }))}
            >
              <option value="all">Tudo</option>
              <option value="30d">30 dias</option>
              <option value="7d">7 dias</option>
            </FilterSelect>
          </FilterBar>
        ) : null}
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {loading ? <p className="muted">Carregando…</p> : null}

      <div className="funil-kanban-scroll">
        <div className="funil-kanban-shell">
          <div className="kanban-board">
            {stages.map((stage) => (
              <div
                key={stage.id}
                className="kanban-column"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDropStage(e, stage.id)}
              >
                <div className="kanban-column-header" style={{ borderTopColor: stage.color }}>
                  {stage.name}
                  <span className="muted"> ({byStage.get(stage.id)?.length ?? 0})</span>
                </div>
                <div className="kanban-column-body">
                  {(byStage.get(stage.id) ?? []).map((card) => (
                    <div key={card.id} className="kanban-card" draggable onDragStart={(e) => handleDragStart(e, card)}>
                      <Link href={`/oportunidades/${card.id}`} className="kanban-card-title">
                        {card.client_name}
                      </Link>
                      <div className="muted" style={{ fontSize: "0.85rem" }}>
                        {card.product_name}
                      </div>
                      <div style={{ fontSize: "0.85rem" }}>{card.title}</div>
                      <div className="kanban-card-meta">
                        {card.owner_name ? <span>Resp.: {card.owner_name}</span> : null}
                        {card.closer_name ? <span>Closer: {card.closer_name}</span> : null}
                        {card.temperature ? <span>{TEMP_LABEL[card.temperature] ?? card.temperature}</span> : null}
                      </div>
                      <div className="kanban-card-meta">
                        {card.estimated_value_tbd ? (
                          <span>Valor a definir</span>
                        ) : card.estimated_value ? (
                          <span>R$ {card.estimated_value}</span>
                        ) : null}
                        {card.next_action_at ? <span>Próx.: {formatSpDateTime(card.next_action_at)}</span> : null}
                      </div>
                      <div className="kanban-card-stage-picker">
                        <StagePicker card={card} stages={stages} onPick={(to, kind) => beginStageMove(card, to, kind)} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <WonLostColumns onDrop={(card, stageId, kind) => beginStageMove(card, stageId, kind)} />
        </div>
      </div>

      {moveModal ? (
        <div className="panel" style={{ marginTop: 16, maxWidth: 480 }}>
          <h3 style={{ marginTop: 0 }}>
            {moveModal.mode === "enter"
              ? `Entrar em ${moveModal.targetStageName ?? "etapa"}`
              : "Concluir movimentação"}
          </h3>
          {moveModal.mode === "enter" && moveModal.enterRules ? (
            <StageEnterMoveForm
              rules={moveModal.enterRules}
              enterNotes={enterNotes}
              setEnterNotes={setEnterNotes}
              enterNextType={enterNextType}
              setEnterNextType={setEnterNextType}
              enterNextDate={enterNextDate}
              setEnterNextDate={setEnterNextDate}
              enterNextTime={enterNextTime}
              setEnterNextTime={setEnterNextTime}
              enterPauseReasonId={enterPauseReasonId}
              setEnterPauseReasonId={setEnterPauseReasonId}
              pauseReasons={pauseReasons}
            />
          ) : moveModal.mode === "won" || moveModal.mode === "lost" ? (
            <MoveExtraForm
              mode={moveModal.mode}
              lossReasons={lossReasons}
              users={users}
              lostReasonId={lostReasonId}
              setLostReasonId={setLostReasonId}
              lostNotes={lostNotes}
              setLostNotes={setLostNotes}
              closerId={closerId}
              setCloserId={setCloserId}
              closedAt={closedAt}
              setClosedAt={setClosedAt}
              dealValue={dealValue}
              setDealValue={setDealValue}
              dealValueTbd={dealValueTbd}
              setDealValueTbd={setDealValueTbd}
            />
          ) : null}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-primary" onClick={() => void confirmSpecialMove()}>
              Confirmar
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setMoveModal(null);
                resetEnterForm();
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StagePicker({
  card,
  stages,
  onPick
}: {
  card: Card;
  stages: Stage[];
  onPick: (stageId: number, kind: string) => void;
}) {
  const [allStages, setAllStages] = useState<Stage[]>(stages);
  useEffect(() => {
    void fetch("/api/pipeline-stages?all=1").then((r) => r.json()).then((d) => setAllStages((d as { items: Stage[] }).items));
  }, [stages]);
  return (
    <select
      className="select"
      style={{ marginTop: 4, fontSize: "0.85rem" }}
      value=""
      onChange={(e) => {
        const to = Number(e.target.value);
        if (!to) return;
        const t = allStages.find((s) => s.id === to);
        onPick(to, t?.kind ?? "in_progress");
      }}
    >
      <option value="">Mover para etapa…</option>
      {allStages.filter((s) => s.id !== card.pipeline_stage_id).map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

function WonLostColumns({ onDrop }: { onDrop: (card: Card, stageId: number, kind: string) => void }) {
  const [terminal, setTerminal] = useState<Stage[]>([]);
  useEffect(() => {
    void fetch("/api/pipeline-stages?all=1").then((r) => r.json()).then((d) =>
      setTerminal((d as { items: Stage[] }).items.filter((s) => s.kind === "won" || s.kind === "lost"))
    );
  }, []);
  if (!terminal.length) return null;
  const ordered = [...terminal].sort((a, b) => {
    if (a.kind === "won" && b.kind === "lost") return -1;
    if (a.kind === "lost" && b.kind === "won") return 1;
    return a.sort_order - b.sort_order;
  });

  return (
    <div className="kanban-terminal">
      <p className="muted kanban-terminal__hint">Arraste aqui para fechar o negócio:</p>
      <div className="kanban-terminal__row">
        {ordered.map((s) => (
          <div
            key={s.id}
            className="kanban-drop-zone"
            style={{ borderColor: s.color }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const raw = e.dataTransfer.getData("application/x-opp-card");
              if (!raw) return;
              onDrop(JSON.parse(raw) as Card, s.id, s.kind);
            }}
          >
            {s.name}
          </div>
        ))}
      </div>
    </div>
  );
}

function StageEnterMoveForm(props: {
  rules: PipelineStageEnterRules;
  enterNotes: string;
  setEnterNotes: (v: string) => void;
  enterNextType: "" | StageEnterActionPayload["type"];
  setEnterNextType: (v: "" | StageEnterActionPayload["type"]) => void;
  enterNextDate: string;
  setEnterNextDate: (v: string) => void;
  enterNextTime: string;
  setEnterNextTime: (v: string) => void;
  enterPauseReasonId: string;
  setEnterPauseReasonId: (v: string) => void;
  pauseReasons: Array<{ id: number; name: string }>;
}) {
  const { rules } = props;
  const showSchedule =
    props.enterNextType === "schedule_return" || props.enterNextType === "schedule_meeting";
  return (
    <>
      {rules.enter_collect_notes ? (
        <div className="field">
          <label className="label">Observação</label>
          <textarea
            className="textarea"
            value={props.enterNotes}
            onChange={(e) => props.setEnterNotes(e.target.value)}
            required
          />
        </div>
      ) : null}
      {rules.enter_allowed_next_actions.length > 0 ? (
        <div className="field">
          <label className="label">Próximo passo{rules.enter_require_next_action ? "" : " (opcional)"}</label>
          <select
            className="select"
            value={props.enterNextType}
            onChange={(e) =>
              props.setEnterNextType(e.target.value as "" | StageEnterActionPayload["type"])
            }
            required={rules.enter_require_next_action}
          >
            <option value="">Selecione…</option>
            {rules.enter_allowed_next_actions.map((key) => (
              <option key={key} value={key}>
                {APPROACH_NEXT_ACTION_LABELS[key as ApproachNextActionKey]}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {showSchedule ? (
        <div className="field">
          <label className="label">Data e horário</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              className="input"
              type="date"
              value={props.enterNextDate}
              onChange={(e) => props.setEnterNextDate(e.target.value)}
              required
            />
            <input
              className="input"
              type="time"
              value={props.enterNextTime}
              onChange={(e) => props.setEnterNextTime(e.target.value)}
              required
            />
          </div>
        </div>
      ) : null}
      {props.enterNextType === "pause" ? (
        <div className="field">
          <label className="label">Motivo da pausa</label>
          <select
            className="select"
            value={props.enterPauseReasonId}
            onChange={(e) => props.setEnterPauseReasonId(e.target.value)}
            required
          >
            <option value="">Selecione…</option>
            {props.pauseReasons.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </>
  );
}

function MoveExtraForm(props: {
  mode: "won" | "lost";
  lossReasons: Array<{ id: number; name: string }>;
  users: User[];
  lostReasonId: string;
  setLostReasonId: (v: string) => void;
  lostNotes: string;
  setLostNotes: (v: string) => void;
  closerId: string;
  setCloserId: (v: string) => void;
  closedAt: string;
  setClosedAt: (v: string) => void;
  dealValue: string;
  setDealValue: (v: string) => void;
  dealValueTbd: boolean;
  setDealValueTbd: (v: boolean) => void;
}) {
  if (props.mode === "lost") {
    return (
      <>
        <div className="field">
          <label className="label">Motivo da perda</label>
          <select className="select" value={props.lostReasonId} onChange={(e) => props.setLostReasonId(e.target.value)} required>
            <option value="">Selecione</option>
            {props.lossReasons.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Observação</label>
          <textarea className="textarea" value={props.lostNotes} onChange={(e) => props.setLostNotes(e.target.value)} />
        </div>
      </>
    );
  }
  if (props.mode === "won") {
    return (
      <>
        <div className="field">
          <label className="label">Closer</label>
          <select className="select" value={props.closerId} onChange={(e) => props.setCloserId(e.target.value)} required>
            <option value="">Selecione</option>
            {props.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Data de fechamento</label>
          <input className="input" type="date" value={props.closedAt} onChange={(e) => props.setClosedAt(e.target.value)} required />
        </div>
        <label style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input type="checkbox" checked={props.dealValueTbd} onChange={(e) => props.setDealValueTbd(e.target.checked)} />
          Valor a definir
        </label>
        {!props.dealValueTbd ? (
          <div className="field">
            <label className="label">Valor do negócio (R$)</label>
            <input className="input" type="number" step="0.01" value={props.dealValue} onChange={(e) => props.setDealValue(e.target.value)} />
          </div>
        ) : null}
      </>
    );
  }
  return null;
}
