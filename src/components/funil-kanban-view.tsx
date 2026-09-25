"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatSpDateTime } from "@/lib/datetime";
import type { Product, User } from "@/lib/types";

type Stage = { id: number; name: string; sort_order: number; color: string; kind: string };
type Card = {
  id: number;
  title: string;
  client_id: number;
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
  const [moveModal, setMoveModal] = useState<{
    card: Card;
    toStageId: number;
  } | null>(null);
  const [lostReasonId, setLostReasonId] = useState("");
  const [lostNotes, setLostNotes] = useState("");
  const [closerId, setCloserId] = useState("");
  const [closedAt, setClosedAt] = useState("");
  const [dealValue, setDealValue] = useState("");
  const [dealValueTbd, setDealValueTbd] = useState(false);
  const [lossReasons, setLossReasons] = useState<Array<{ id: number; name: string }>>([]);

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
  }, [load]);

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
    if (card.pipeline_stage_id === stageId) return;
    const targetStage = stages.find((s) => s.id === stageId);
    const allStages = stages;
    const fullTarget = allStages.find((s) => s.id === stageId);
    if (!targetStage && !fullTarget) {
      void fetch("/api/opportunities/kanban?period=all")
        .then((r) => r.json())
        .then((d) => {
          const st = (d as { stages: Stage[] }).stages.find((s) => s.id === stageId);
          if (st?.kind === "lost" || st?.kind === "won") {
            setMoveModal({ card, toStageId: stageId });
          } else void moveCard(card, stageId);
        });
      return;
    }
    if (targetStage) {
      void moveCard(card, stageId);
    }
  }

  function handleDragStart(e: React.DragEvent, card: Card) {
    e.dataTransfer.setData("application/x-opp-card", JSON.stringify(card));
  }

  async function confirmSpecialMove() {
    if (!moveModal) return;
    const stRes = await fetch("/api/pipeline-stages?all=1");
    const stData = (await stRes.json()) as { items: Stage[] };
    const target = stData.items.find((s) => s.id === moveModal.toStageId);
    if (target?.kind === "lost") {
      await moveCard(moveModal.card, moveModal.toStageId, {
        lost_reason_id: Number(lostReasonId),
        lost_notes: lostNotes || null
      });
    } else if (target?.kind === "won") {
      await moveCard(moveModal.card, moveModal.toStageId, {
        conversion: {
          closer_user_id: Number(closerId),
          closed_at: new Date(`${closedAt}T12:00:00-03:00`).toISOString(),
          deal_value: dealValueTbd ? null : dealValue ? Number(dealValue) : null,
          deal_value_tbd: dealValueTbd
        }
      });
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <h1 style={{ marginTop: 0 }}>Funil comercial</h1>
        <Link className="btn" href="/funil/convertidos">
          Negócios convertidos
        </Link>
      </div>
      <p className="muted">Arraste os cartões entre etapas ou use a seleção de etapa em cada cartão. Abordagens não alteram a etapa automaticamente.</p>
      <div className="filters-row">
        <div className="field">
          <label className="label">Produto</label>
          <select className="select" value={filters.product_id} onChange={(e) => setFilters((f) => ({ ...f, product_id: e.target.value }))}>
            <option value="">Todos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">BDR origem</label>
          <select className="select" value={filters.origin_bdr_user_id} onChange={(e) => setFilters((f) => ({ ...f, origin_bdr_user_id: e.target.value }))}>
            <option value="">Todos</option>
            {bdrs.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Responsável</label>
          <select className="select" value={filters.owner_user_id} onChange={(e) => setFilters((f) => ({ ...f, owner_user_id: e.target.value }))}>
            <option value="">Todos</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Closer</label>
          <select className="select" value={filters.closer_user_id} onChange={(e) => setFilters((f) => ({ ...f, closer_user_id: e.target.value }))}>
            <option value="">Todos</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Temperatura</label>
          <select className="select" value={filters.temperature} onChange={(e) => setFilters((f) => ({ ...f, temperature: e.target.value }))}>
            <option value="">Todas</option>
            <option value="cold">Frio</option>
            <option value="warm">Morno</option>
            <option value="hot">Quente</option>
          </select>
        </div>
        <div className="field">
          <label className="label">Cidade</label>
          <input className="input" value={filters.city} onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))} />
        </div>
        <div className="field">
          <label className="label">UF</label>
          <input className="input" maxLength={2} value={filters.uf} onChange={(e) => setFilters((f) => ({ ...f, uf: e.target.value }))} />
        </div>
        <div className="field">
          <label className="label">Período (criação)</label>
          <select className="select" value={filters.period} onChange={(e) => setFilters((f) => ({ ...f, period: e.target.value }))}>
            <option value="all">Tudo</option>
            <option value="30d">30 dias</option>
            <option value="7d">7 dias</option>
          </select>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {loading ? <p className="muted">Carregando…</p> : null}

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
                  <StagePicker card={card} stages={stages} onPick={(to, kind) => {
                    if (kind === "won" || kind === "lost") setMoveModal({ card, toStageId: to });
                    else void moveCard(card, to);
                  }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <WonLostColumns onDrop={(card, stageId, kind) => {
        if (kind === "won" || kind === "lost") setMoveModal({ card, toStageId: stageId });
        else void moveCard(card, stageId);
      }} />

      {moveModal ? (
        <div className="panel" style={{ marginTop: 16, maxWidth: 480 }}>
          <h3 style={{ marginTop: 0 }}>Concluir movimentação</h3>
          <MoveExtraForm
            toStageId={moveModal.toStageId}
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
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={() => void confirmSpecialMove()}>
              Confirmar
            </button>
            <button type="button" className="btn" onClick={() => setMoveModal(null)}>
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
  return (
    <div className="kanban-terminal" style={{ marginTop: 16 }}>
      <p className="muted">Arraste aqui para fechar o negócio:</p>
      <div style={{ display: "flex", gap: 12 }}>
        {terminal.map((s) => (
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

function MoveExtraForm(props: {
  toStageId: number;
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
  const [kind, setKind] = useState<string>("");
  useEffect(() => {
    void fetch("/api/pipeline-stages?all=1").then((r) => r.json()).then((d) => {
      const t = (d as { items: Stage[] }).items.find((s) => s.id === props.toStageId);
      setKind(t?.kind ?? "");
    });
  }, [props.toStageId]);

  if (kind === "lost") {
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
  if (kind === "won") {
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
