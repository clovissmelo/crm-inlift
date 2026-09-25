import { all, get, nowIso, run } from "@/lib/db";
import { periodToRange, type DashboardPeriod } from "@/lib/datetime";
import { getPipelineStage } from "@/lib/pipeline-stages";

export type OpportunityOutcome = "open" | "won" | "lost";
export type OpportunityTemperature = "cold" | "warm" | "hot";

export type KanbanCard = {
  id: number;
  title: string;
  client_id: number;
  client_name: string;
  city: string | null;
  uf: string | null;
  product_id: number;
  product_name: string;
  uses_proposal: boolean;
  origin_bdr_name: string | null;
  owner_name: string | null;
  closer_name: string | null;
  temperature: string | null;
  estimated_value: string | null;
  estimated_value_tbd: boolean;
  expected_close_date: string | null;
  next_action_at: string | null;
  pipeline_stage_id: number;
  outcome: OpportunityOutcome;
  row_version: number;
};

export async function findOpenOpportunitiesForProduct(clientId: number, productId: number) {
  return all<{ id: number; title: string; created_at: string }>(
    `
      SELECT id, title, created_at FROM opportunities
      WHERE client_id = @clientId AND product_id = @productId AND outcome = 'open'
      ORDER BY updated_at DESC
    `,
    { clientId, productId }
  );
}

export async function getDefaultStageId(name: string) {
  const row = await get<{ id: number }>("SELECT id FROM pipeline_stages WHERE name = @name LIMIT 1", { name });
  return row?.id ?? null;
}

export async function createOpportunity(input: {
  client_id: number;
  product_id: number;
  title: string;
  origin_bdr_user_id?: number | null;
  owner_user_id?: number | null;
  closer_user_id?: number | null;
  temperature?: OpportunityTemperature | null;
  pipeline_stage_id?: number | null;
  estimated_value?: number | null;
  estimated_value_tbd?: boolean;
  expected_close_date?: string | null;
  notes?: string | null;
  created_by_user_id: number;
}) {
  const client = await get<{ bdr_user_id: number | null; trade_name: string | null; legal_name: string | null }>(
    "SELECT bdr_user_id, trade_name, legal_name FROM clients WHERE id = @id",
    { id: input.client_id }
  );
  const product = await get<{ name: string }>("SELECT name FROM products WHERE id = @id", { id: input.product_id });
  const stageId =
    input.pipeline_stage_id ??
    (await getDefaultStageId("Interessado")) ??
    (await get<{ id: number }>("SELECT id FROM pipeline_stages WHERE kind = 'in_progress' ORDER BY sort_order LIMIT 1"))?.id;

  if (!stageId) throw new Error("Nenhuma etapa comercial configurada");

  const originBdr = input.origin_bdr_user_id ?? client?.bdr_user_id ?? input.created_by_user_id;
  const owner = input.owner_user_id ?? originBdr;
  const title = input.title.trim() || `${product?.name ?? "Produto"} — ${client?.trade_name || client?.legal_name || "Cliente"}`;

  const result = await run(
    `
      INSERT INTO opportunities (
        client_id, product_id, title, origin_bdr_user_id, owner_user_id, closer_user_id,
        temperature, pipeline_stage_id, estimated_value, estimated_value_tbd, expected_close_date,
        notes, outcome, engagement_status, row_version, created_at, updated_at
      ) VALUES (
        @clientId, @productId, @title, @originBdr, @owner, @closer,
        @temperature, @stageId, @estimatedValue, @valueTbd, @expectedClose,
        @notes, 'open', 'active', 1, @now, @now
      )
    `,
    {
      clientId: input.client_id,
      productId: input.product_id,
      title,
      originBdr,
      owner,
      closer: input.closer_user_id ?? null,
      temperature: input.temperature ?? null,
      stageId,
      estimatedValue: input.estimated_value ?? null,
      valueTbd: input.estimated_value_tbd ?? false,
      expectedClose: input.expected_close_date ?? null,
      notes: input.notes ?? null,
      now: nowIso()
    }
  );
  const opportunityId = result.lastInsertRowid;
  if (!opportunityId) throw new Error("Falha ao criar oportunidade");

  await run(
    `
      INSERT INTO opportunity_stage_logs (opportunity_id, from_stage_id, to_stage_id, user_id, notes, created_at)
      VALUES (@oppId, NULL, @stageId, @userId, 'Criação', @now)
    `,
    { oppId: opportunityId, stageId, userId: input.created_by_user_id, now: nowIso() }
  );

  if (input.temperature) {
    await logTemperatureChange(opportunityId, input.client_id, input.product_id, null, input.temperature, input.created_by_user_id);
  }

  return opportunityId;
}

export async function resolveOpportunityForMeeting(input: {
  client_id: number;
  product_id: number | null;
  opportunity_id?: number | null;
  user_id: number;
  create_if_missing?: boolean;
}) {
  if (input.opportunity_id) return input.opportunity_id;
  if (!input.product_id) return null;

  const open = await findOpenOpportunitiesForProduct(input.client_id, input.product_id);
  if (open.length === 1) return open[0].id;
  if (open.length > 1 && !input.create_if_missing) return null;

  if (input.create_if_missing) {
    const agendado = await getDefaultStageId("Agendado");
    return createOpportunity({
      client_id: input.client_id,
      product_id: input.product_id,
      title: "",
      pipeline_stage_id: agendado,
      created_by_user_id: input.user_id
    });
  }
  return open[0]?.id ?? null;
}

async function logTemperatureChange(
  opportunityId: number,
  clientId: number,
  productId: number,
  oldTemp: string | null,
  newTemp: string | null,
  userId: number
) {
  await run(
    `
      INSERT INTO opportunity_temperature_logs (opportunity_id, client_id, product_id, old_temperature, new_temperature, user_id, created_at)
      VALUES (@oppId, @clientId, @productId, @old, @newTemp, @userId, @now)
    `,
    { oppId: opportunityId, clientId, productId, old: oldTemp, newTemp, userId, now: nowIso() }
  );
}

export async function setOpportunityTemperatureById(
  opportunityId: number,
  userId: number,
  temperature: OpportunityTemperature | null
) {
  const row = await get<{ client_id: number; product_id: number; temperature: string | null }>(
    "SELECT client_id, product_id, temperature FROM opportunities WHERE id = @id",
    { id: opportunityId }
  );
  if (!row) throw new Error("Oportunidade não encontrada");
  await run(`UPDATE opportunities SET temperature = @t, updated_at = @now, row_version = row_version + 1 WHERE id = @id`, {
    id: opportunityId,
    t: temperature,
    now: nowIso()
  });
  await logTemperatureChange(opportunityId, row.client_id, row.product_id, row.temperature, temperature, userId);
}

export async function getOpportunityDetail(id: number) {
  const opp = await get<Record<string, unknown>>(
    `
      SELECT o.*,
        COALESCE(c.trade_name, c.legal_name, 'Cliente') AS client_name,
        c.city, c.uf,
        p.name AS product_name, p.uses_proposal,
        ob.name AS origin_bdr_name, ow.name AS owner_name, cl.name AS closer_name,
        ps.name AS stage_name, ps.kind AS stage_kind, ps.color AS stage_color,
        lr.name AS lost_reason_name
      FROM opportunities o
      JOIN clients c ON c.id = o.client_id
      JOIN products p ON p.id = o.product_id
      LEFT JOIN users ob ON ob.id = o.origin_bdr_user_id
      LEFT JOIN users ow ON ow.id = o.owner_user_id
      LEFT JOIN users cl ON cl.id = o.closer_user_id
      LEFT JOIN pipeline_stages ps ON ps.id = o.pipeline_stage_id
      LEFT JOIN opportunity_loss_reasons lr ON lr.id = o.lost_reason_id
      WHERE o.id = @id
    `,
    { id }
  );
  if (!opp) return null;

  const stageLogs = await all(
    `
      SELECT l.id, l.created_at, l.notes, u.name AS user_name,
        fs.name AS from_stage_name, ts.name AS to_stage_name
      FROM opportunity_stage_logs l
      LEFT JOIN users u ON u.id = l.user_id
      LEFT JOIN pipeline_stages fs ON fs.id = l.from_stage_id
      JOIN pipeline_stages ts ON ts.id = l.to_stage_id
      WHERE l.opportunity_id = @id
      ORDER BY l.created_at DESC
    `,
    { id }
  );

  const meetings = await all(
    `
      SELECT m.id, m.title, m.starts_at, m.status, m.meet_link
      FROM meetings m WHERE m.opportunity_id = @id OR (m.client_id = @clientId AND m.product_id = @productId)
      ORDER BY m.starts_at DESC LIMIT 20
    `,
    { id, clientId: Number(opp.client_id), productId: Number(opp.product_id) }
  );

  const lastApproach = await get(
    `
      SELECT a.occurred_at, rt.name AS result_name, a.notes, u.name AS user_name
      FROM approaches a
      LEFT JOIN approach_result_types rt ON rt.id = a.result_type_id
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.client_id = @clientId AND (a.product_id = @productId OR a.product_id IS NULL)
      ORDER BY a.occurred_at DESC LIMIT 1
    `,
    { clientId: Number(opp.client_id), productId: Number(opp.product_id) }
  );

  const proposals = await all(
    `SELECT * FROM opportunity_proposals WHERE opportunity_id = @id ORDER BY version_number DESC`,
    { id }
  );

  const conversion = await get<{ id: number }>(
    `SELECT * FROM opportunity_conversion_snapshots WHERE opportunity_id = @id AND is_current = true`,
    { id }
  );

  const amendments = conversion
    ? await all(
        `SELECT * FROM opportunity_conversion_amendments WHERE snapshot_id = @sid ORDER BY created_at DESC`,
        { sid: conversion.id }
      )
    : [];

  return { opportunity: opp, stage_logs: stageLogs, meetings, last_approach: lastApproach, proposals, conversion, amendments };
}

export async function listClientOpportunityCards(clientId: number) {
  return all<{
    id: number;
    product_id: number;
    product_name: string;
    title: string;
    temperature: string | null;
    outcome: string;
    stage_name: string | null;
    stage_color: string | null;
    owner_name: string | null;
  }>(
    `
      SELECT o.id, o.product_id, p.name AS product_name, o.title, o.temperature, o.outcome,
        ps.name AS stage_name, ps.color AS stage_color, ow.name AS owner_name
      FROM opportunities o
      JOIN products p ON p.id = o.product_id
      LEFT JOIN pipeline_stages ps ON ps.id = o.pipeline_stage_id
      LEFT JOIN users ow ON ow.id = o.owner_user_id
      WHERE o.client_id = @clientId
      ORDER BY o.outcome = 'open' DESC, o.updated_at DESC
    `,
    { clientId }
  );
}

function buildKanbanFilters(filters: KanbanFilters) {
  const where: string[] = ["o.outcome = 'open'"];
  const params: Record<string, string | number> = {};

  if (filters.product_id) {
    where.push("o.product_id = @productId");
    params.productId = filters.product_id;
  }
  if (filters.origin_bdr_user_id) {
    where.push("o.origin_bdr_user_id = @originBdr");
    params.originBdr = filters.origin_bdr_user_id;
  }
  if (filters.owner_user_id) {
    where.push("o.owner_user_id = @ownerId");
    params.ownerId = filters.owner_user_id;
  }
  if (filters.closer_user_id) {
    where.push("o.closer_user_id = @closerId");
    params.closerId = filters.closer_user_id;
  }
  if (filters.temperature) {
    where.push("o.temperature = @temperature");
    params.temperature = filters.temperature;
  }
  if (filters.city) {
    where.push("LOWER(c.city) LIKE LOWER(@city)");
    params.city = `%${filters.city}%`;
  }
  if (filters.uf) {
    where.push("UPPER(c.uf) = UPPER(@uf)");
    params.uf = filters.uf;
  }
  const range = periodToRange(filters.period ?? "all");
  if (range.from) {
    where.push("o.created_at >= @from");
    params.from = range.from;
  }
  if (range.to) {
    where.push("o.created_at <= @to");
    params.to = range.to;
  }

  return { where: where.join(" AND "), params };
}

export type KanbanFilters = {
  product_id?: number;
  origin_bdr_user_id?: number;
  owner_user_id?: number;
  closer_user_id?: number;
  temperature?: string;
  city?: string;
  uf?: string;
  period?: DashboardPeriod;
};

export async function getKanbanData(filters: KanbanFilters) {
  const { where, params } = buildKanbanFilters(filters);
  const cards = await all<KanbanCard>(
    `
      SELECT o.id, o.title, o.client_id,
        COALESCE(c.trade_name, c.legal_name, 'Cliente') AS client_name,
        c.city, c.uf, o.product_id, p.name AS product_name, p.uses_proposal,
        ob.name AS origin_bdr_name, ow.name AS owner_name, cl.name AS closer_name,
        o.temperature, o.estimated_value::text, o.estimated_value_tbd, o.expected_close_date::text,
        (
          SELECT MIN(m.starts_at) FROM meetings m
          WHERE m.opportunity_id = o.id AND m.status NOT IN ('cancelled') AND m.starts_at >= now()
        ) AS next_action_at,
        o.pipeline_stage_id, o.outcome, o.row_version
      FROM opportunities o
      JOIN clients c ON c.id = o.client_id
      JOIN products p ON p.id = o.product_id
      LEFT JOIN users ob ON ob.id = o.origin_bdr_user_id
      LEFT JOIN users ow ON ow.id = o.owner_user_id
      LEFT JOIN users cl ON cl.id = o.closer_user_id
      WHERE ${where}
      ORDER BY o.updated_at DESC
    `,
    params
  );
  return cards;
}

export async function updateOpportunityFields(
  id: number,
  userId: number,
  patch: {
    title?: string;
    owner_user_id?: number | null;
    closer_user_id?: number | null;
    temperature?: OpportunityTemperature | null;
    estimated_value?: number | null;
    estimated_value_tbd?: boolean;
    expected_close_date?: string | null;
    notes?: string | null;
    expected_version?: number;
  }
) {
  const current = await get<{ row_version: number; client_id: number; product_id: number; temperature: string | null }>(
    "SELECT row_version, client_id, product_id, temperature FROM opportunities WHERE id = @id",
    { id }
  );
  if (!current) throw new Error("Oportunidade não encontrada");
  if (patch.expected_version !== undefined && patch.expected_version !== current.row_version) {
    const err = new Error("CONFLICT_VERSION");
    throw err;
  }

  await run(
    `
      UPDATE opportunities SET
        title = COALESCE(@title, title),
        owner_user_id = COALESCE(@owner, owner_user_id),
        closer_user_id = COALESCE(@closer, closer_user_id),
        estimated_value = COALESCE(@estValue, estimated_value),
        estimated_value_tbd = COALESCE(@valueTbd, estimated_value_tbd),
        expected_close_date = COALESCE(@expectedClose::date, expected_close_date),
        notes = COALESCE(@notes, notes),
        updated_at = @now,
        row_version = row_version + 1
      WHERE id = @id
    `,
    {
      id,
      title: patch.title ?? null,
      owner: patch.owner_user_id === undefined ? null : patch.owner_user_id,
      closer: patch.closer_user_id === undefined ? null : patch.closer_user_id,
      estValue: patch.estimated_value === undefined ? null : patch.estimated_value,
      valueTbd: patch.estimated_value_tbd === undefined ? null : patch.estimated_value_tbd,
      expectedClose: patch.expected_close_date === undefined ? null : patch.expected_close_date,
      notes: patch.notes === undefined ? null : patch.notes,
      now: nowIso()
    }
  );

  if (patch.temperature !== undefined && patch.temperature !== current.temperature) {
    await run(`UPDATE opportunities SET temperature = @t, row_version = row_version + 1 WHERE id = @id`, {
      id,
      t: patch.temperature
    });
    await logTemperatureChange(id, current.client_id, current.product_id, current.temperature, patch.temperature, userId);
  }
}

export async function moveOpportunityStage(input: {
  opportunity_id: number;
  to_stage_id: number;
  user_id: number;
  expected_version: number;
  notes?: string | null;
  lost_reason_id?: number | null;
  lost_notes?: string | null;
  conversion?: {
    closer_user_id: number;
    closed_at: string;
    deal_value?: number | null;
    deal_value_tbd?: boolean;
  };
  amend_conversion?: {
    reason: string;
    closer_user_id: number;
    closed_at: string;
    deal_value?: number | null;
    deal_value_tbd?: boolean;
  };
}) {
  const opp = await get<{
    id: number;
    row_version: number;
    pipeline_stage_id: number | null;
    client_id: number;
    product_id: number;
    outcome: string;
  }>("SELECT id, row_version, pipeline_stage_id, client_id, product_id, outcome FROM opportunities WHERE id = @id", {
    id: input.opportunity_id
  });
  if (!opp) throw new Error("Oportunidade não encontrada");
  if (opp.row_version !== input.expected_version) {
    throw new Error("CONFLICT_VERSION");
  }

  const toStage = await getPipelineStage(input.to_stage_id);
  if (!toStage || toStage.status !== "active") throw new Error("Etapa inválida");

  const fromStageId = opp.pipeline_stage_id;
  if (fromStageId === input.to_stage_id) return;

  const fromStage = fromStageId ? await getPipelineStage(fromStageId) : null;
  if (fromStage && toStage.sort_order < fromStage.sort_order && toStage.kind === "in_progress") {
    // allow manual move backwards in kanban? User said approaches can't move backwards - manual drag might be OK
  }

  if (toStage.kind === "lost") {
    if (!input.lost_reason_id) throw new Error("Selecione o motivo da perda");
  }

  if (toStage.kind === "won") {
    const conv = input.conversion;
    if (!conv?.closer_user_id || !conv.closed_at) {
      throw new Error("Informe closer e data de fechamento para converter");
    }
  }

  const now = nowIso();
  let outcome: OpportunityOutcome = "open";
  let closedAt: string | null = null;
  if (toStage.kind === "won") {
    outcome = "won";
    closedAt = input.conversion!.closed_at;
  } else if (toStage.kind === "lost") {
    outcome = "lost";
    closedAt = now;
  }

  await run(
    `
      UPDATE opportunities SET
        pipeline_stage_id = @stageId,
        outcome = @outcome,
        lost_reason_id = @lostReason,
        lost_notes = @lostNotes,
        closer_user_id = COALESCE(@closer, closer_user_id),
        closed_at = COALESCE(@closedAt, closed_at),
        updated_at = @now,
        row_version = row_version + 1
      WHERE id = @id AND row_version = @version
    `,
    {
      id: input.opportunity_id,
      stageId: input.to_stage_id,
      outcome,
      lostReason: toStage.kind === "lost" ? (input.lost_reason_id ?? null) : null,
      lostNotes: toStage.kind === "lost" ? input.lost_notes ?? null : null,
      closer: toStage.kind === "won" ? input.conversion!.closer_user_id : null,
      closedAt,
      now,
      version: input.expected_version
    }
  );

  const updated = await get<{ row_version: number }>("SELECT row_version FROM opportunities WHERE id = @id", {
    id: input.opportunity_id
  });
  if (!updated || updated.row_version === input.expected_version) {
    throw new Error("CONFLICT_VERSION");
  }

  await run(
    `
      INSERT INTO opportunity_stage_logs (opportunity_id, from_stage_id, to_stage_id, user_id, notes, created_at)
      VALUES (@oppId, @fromId, @toId, @userId, @notes, @now)
    `,
    {
      oppId: input.opportunity_id,
      fromId: fromStageId,
      toId: input.to_stage_id,
      userId: input.user_id,
      notes: input.notes ?? null,
      now
    }
  );

  if (toStage.kind === "won" && input.conversion) {
    await run(`UPDATE opportunity_conversion_snapshots SET is_current = false WHERE opportunity_id = @id`, {
      id: input.opportunity_id
    });
    const snap = await run(
      `
        INSERT INTO opportunity_conversion_snapshots (
          opportunity_id, closer_user_id, product_id, closed_at, deal_value, deal_value_tbd,
          recorded_by_user_id, recorded_at, is_current
        ) VALUES (@oppId, @closer, @productId, @closedAt, @value, @valueTbd, @userId, @now, true)
      `,
      {
        oppId: input.opportunity_id,
        closer: input.conversion.closer_user_id,
        productId: opp.product_id,
        closedAt: input.conversion.closed_at,
        value: input.conversion.deal_value ?? null,
        valueTbd: input.conversion.deal_value_tbd ?? false,
        userId: input.user_id,
        now
      }
    );
    if (input.amend_conversion && snap.lastInsertRowid) {
      // handled separately via amend API
    }
  }
}

export async function amendConversion(input: {
  opportunity_id: number;
  user_id: number;
  reason: string;
  closer_user_id: number;
  closed_at: string;
  deal_value?: number | null;
  deal_value_tbd?: boolean;
}) {
  const snap = await get<{
    id: number;
    closer_user_id: number;
    closed_at: string;
    deal_value: string | null;
    deal_value_tbd: boolean;
  }>(
    `SELECT * FROM opportunity_conversion_snapshots WHERE opportunity_id = @id AND is_current = true`,
    { id: input.opportunity_id }
  );
  if (!snap) throw new Error("Nenhuma conversão registrada");

  await run(
    `
      INSERT INTO opportunity_conversion_amendments (
        snapshot_id, opportunity_id,
        previous_closer_user_id, previous_closed_at, previous_deal_value, previous_deal_value_tbd,
        new_closer_user_id, new_closed_at, new_deal_value, new_deal_value_tbd,
        reason, amended_by_user_id, created_at
      ) VALUES (
        @snapId, @oppId,
        @pCloser, @pClosed, @pValue, @pTbd,
        @nCloser, @nClosed, @nValue, @nTbd,
        @reason, @userId, @now
      )
    `,
    {
      snapId: snap.id,
      oppId: input.opportunity_id,
      pCloser: snap.closer_user_id,
      pClosed: snap.closed_at,
      pValue: snap.deal_value,
      pTbd: snap.deal_value_tbd,
      nCloser: input.closer_user_id,
      nClosed: input.closed_at,
      nValue: input.deal_value ?? null,
      nTbd: input.deal_value_tbd ?? false,
      reason: input.reason,
      userId: input.user_id,
      now: nowIso()
    }
  );

  await run(
    `
      UPDATE opportunity_conversion_snapshots SET
        closer_user_id = @closer, closed_at = @closedAt, deal_value = @value, deal_value_tbd = @tbd
      WHERE id = @id
    `,
    {
      id: snap.id,
      closer: input.closer_user_id,
      closedAt: input.closed_at,
      value: input.deal_value ?? null,
      tbd: input.deal_value_tbd ?? false
    }
  );

  await run(
    `
      UPDATE opportunities SET closer_user_id = @closer, closed_at = @closedAt, updated_at = @now, row_version = row_version + 1
      WHERE id = @oppId
    `,
    {
      oppId: input.opportunity_id,
      closer: input.closer_user_id,
      closedAt: input.closed_at,
      now: nowIso()
    }
  );
}

export async function listConvertedDeals(filters: {
  period?: DashboardPeriod;
  product_id?: number;
  origin_bdr_user_id?: number;
  closer_user_id?: number;
}) {
  const range = periodToRange(filters.period ?? "all");
  const where: string[] = ["o.outcome = 'won'"];
  const params: Record<string, string | number> = {};
  if (filters.product_id) {
    where.push("o.product_id = @productId");
    params.productId = filters.product_id;
  }
  if (filters.origin_bdr_user_id) {
    where.push("o.origin_bdr_user_id = @bdr");
    params.bdr = filters.origin_bdr_user_id;
  }
  if (filters.closer_user_id) {
    where.push("s.closer_user_id = @closer");
    params.closer = filters.closer_user_id;
  }
  if (range.from) {
    where.push("s.closed_at >= @from");
    params.from = range.from;
  }
  if (range.to) {
    where.push("s.closed_at <= @to");
    params.to = range.to;
  }

  return all(
    `
      SELECT o.id AS opportunity_id, o.title,
        COALESCE(c.trade_name, c.legal_name) AS client_name,
        p.name AS product_name,
        ob.name AS origin_bdr_name,
        u.name AS closer_name,
        s.closed_at, s.deal_value::text, s.deal_value_tbd, s.recorded_at
      FROM opportunities o
      JOIN opportunity_conversion_snapshots s ON s.opportunity_id = o.id AND s.is_current = true
      JOIN clients c ON c.id = o.client_id
      JOIN products p ON p.id = o.product_id
      LEFT JOIN users ob ON ob.id = o.origin_bdr_user_id
      JOIN users u ON u.id = s.closer_user_id
      WHERE ${where.join(" AND ")}
      ORDER BY s.closed_at DESC
    `,
    params
  );
}

export async function getOpportunityDashboardMetrics(filters: {
  period: DashboardPeriod;
  product_id?: number;
  owner_user_id?: number;
}) {
  const range = periodToRange(filters.period);
  const params: Record<string, string | number> = {};
  let openFilter = "o.outcome = 'open'";
  let proposalFilter = "pr.status = 'sent'";
  let wonFilter = "o.outcome = 'won'";

  if (filters.product_id) {
    openFilter += " AND o.product_id = @productId";
    proposalFilter += " AND o.product_id = @productId";
    wonFilter += " AND o.product_id = @productId";
    params.productId = filters.product_id;
  }
  if (filters.owner_user_id) {
    openFilter += " AND o.owner_user_id = @ownerId";
    proposalFilter += " AND o.owner_user_id = @ownerId";
    wonFilter += " AND o.owner_user_id = @ownerId";
    params.ownerId = filters.owner_user_id;
  }

  const openCount = await get<{ count: string }>(`SELECT COUNT(*)::text AS count FROM opportunities o WHERE ${openFilter}`, params);

  let proposalSql = `
    SELECT COUNT(*)::text AS count FROM opportunity_proposals pr
    JOIN opportunities o ON o.id = pr.opportunity_id
    WHERE ${proposalFilter}
  `;
  if (range.from) {
    proposalSql += " AND pr.sent_at >= @from";
    params.from = range.from;
  }
  if (range.to) {
    proposalSql += " AND pr.sent_at <= @to";
    params.to = range.to;
  }
  const proposalsSent = await get<{ count: string }>(proposalSql, params);

  let wonSql = `
    SELECT COUNT(*)::text AS count FROM opportunities o
    JOIN opportunity_conversion_snapshots s ON s.opportunity_id = o.id AND s.is_current = true
    WHERE ${wonFilter}
  `;
  if (range.from) {
    wonSql += " AND s.closed_at >= @from";
    if (!params.from) params.from = range.from;
  }
  if (range.to) {
    wonSql += " AND s.closed_at <= @to";
    if (!params.to) params.to = range.to;
  }
  const converted = await get<{ count: string }>(wonSql, params);

  return {
    open_opportunities: Number(openCount?.count ?? 0),
    proposals_sent: Number(proposalsSent?.count ?? 0),
    deals_converted: Number(converted?.count ?? 0),
    open_count_basis: "Oportunidades abertas (situação atual, sem filtro de período)",
    proposals_sent_basis: "Propostas marcadas como enviadas (data de envio declarada)",
    converted_basis: "Negócios convertidos (data de fechamento registrada na conversão)"
  };
}
