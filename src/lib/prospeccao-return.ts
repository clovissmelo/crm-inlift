import { PROSPECCAO_PIPELINE_STAGE_NAME } from "@/lib/attendance/operational-actions";
import { reenterProspeccaoProduct } from "@/lib/client-product-prospeccao";
import { get, nowIso, run } from "@/lib/db";
import { spDayStartUtcIso } from "@/lib/datetime";
import { getDefaultStageId, moveOpportunityStage } from "@/lib/opportunity-pipeline";

/** Coloca o cliente na fila de prospecção (manual), com produto de oportunidade e BDR. */
export async function enrollClientInProspeccaoQueue(
  clientId: number,
  actorUserId: number,
  productId: number,
  bdrUserId: number
) {
  const linked = await get<{ ok: number }>(
    `
      SELECT 1 AS ok FROM opportunities
      WHERE client_id = @clientId AND product_id = @productId
      LIMIT 1
    `,
    { clientId, productId }
  );
  if (!linked) {
    throw new Error("Selecione um produto das oportunidades cadastradas neste cliente.");
  }

  const bdr = await get<{ id: number }>("SELECT id FROM users WHERE id = @id AND status = 'active'", { id: bdrUserId });
  if (!bdr) throw new Error("BDR inválido.");

  const now = nowIso();
  await run(
    `
      UPDATE opportunities SET
        owner_user_id = @bdrUserId,
        origin_bdr_user_id = COALESCE(origin_bdr_user_id, @bdrUserId),
        updated_at = @now,
        row_version = row_version + 1
      WHERE client_id = @clientId AND product_id = @productId AND outcome = 'open'
    `,
    { clientId, productId, bdrUserId, now }
  );

  await reenterProspeccaoProduct(clientId, productId);

  await run(
    `
      UPDATE clients SET in_prospeccao_queue = true, updated_at = @now
      WHERE id = @clientId
    `,
    { clientId, now }
  );

  const otherBdr = await get<{ owner_user_id: number | null }>(
    `
      SELECT owner_user_id FROM opportunities
      WHERE client_id = @clientId AND outcome = 'open'
      ORDER BY updated_at DESC LIMIT 1
    `,
    { clientId }
  );
  if (otherBdr?.owner_user_id) {
    await run("UPDATE clients SET bdr_user_id = @bdrUserId, updated_at = @now WHERE id = @clientId", {
      clientId,
      bdrUserId: otherBdr.owner_user_id,
      now
    });
  }

  await returnClientToProspeccaoQueue(clientId, actorUserId, productId, bdrUserId);
}

/** Recoloca o cliente na fila de prospecção; se já houve abordagem, agenda retorno para hoje. */
export async function returnClientToProspeccaoQueue(
  clientId: number,
  actorUserId: number,
  productId?: number | null,
  assignedBdrUserId?: number | null,
  followUpNotes = "Retorno à prospecção ao criar oportunidade"
) {
  const now = nowIso();
  await run(
    "UPDATE clients SET in_prospeccao_queue = true, updated_at = @now WHERE id = @clientId",
    { clientId, now }
  );

  const hasApproach = await get<{ ok: number }>(
    "SELECT 1 AS ok FROM approaches WHERE client_id = @clientId LIMIT 1",
    { clientId }
  );
  if (!hasApproach) return;

  const pending = await get<{ id: number }>(
    "SELECT id FROM follow_ups WHERE client_id = @clientId AND status = 'pending' LIMIT 1",
    { clientId }
  );
  if (pending) return;

  let assigned = assignedBdrUserId ?? null;
  if (assigned == null && productId != null) {
    const opp = await get<{ owner_user_id: number | null }>(
      `
        SELECT owner_user_id FROM opportunities
        WHERE client_id = @clientId AND product_id = @productId AND outcome = 'open'
        ORDER BY updated_at DESC LIMIT 1
      `,
      { clientId, productId }
    );
    assigned = opp?.owner_user_id ?? null;
  }
  if (assigned == null) {
    const client = await get<{ bdr_user_id: number | null }>(
      "SELECT bdr_user_id FROM clients WHERE id = @clientId",
      { clientId }
    );
    assigned = client?.bdr_user_id ?? actorUserId;
  }
  const scheduledAt = spDayStartUtcIso();

  await run(
    `
      INSERT INTO follow_ups (
        client_id, product_id, kind, assigned_user_id, created_by_user_id,
        scheduled_at, status, notes, created_at, updated_at
      ) VALUES (
        @clientId, @productId, 'return', @assignedUserId, @createdBy,
        @scheduledAt, 'pending', @notes, @now, @now
      )
    `,
    {
      clientId,
      productId: productId ?? null,
      assignedUserId: assigned,
      createdBy: actorUserId,
      scheduledAt,
      notes: followUpNotes,
      now
    }
  );
}

/** Reunião cancelada: volta à fila Leads para contato como retorno e etapa Prospecção no funil. */
export async function restoreProspeccaoAfterMeetingCancelled(input: {
  clientId: number;
  productId: number | null;
  opportunityId: number | null;
  bdrUserId: number | null;
  actorUserId: number;
}) {
  const { clientId, productId, opportunityId, bdrUserId, actorUserId } = input;
  const now = nowIso();

  await run(
    "UPDATE clients SET in_prospeccao_queue = true, updated_at = @now WHERE id = @clientId",
    { clientId, now }
  );

  if (productId != null) {
    await reenterProspeccaoProduct(clientId, productId);
  }

  const pending = await get<{ id: number }>(
    "SELECT id FROM follow_ups WHERE client_id = @clientId AND status = 'pending' LIMIT 1",
    { clientId }
  );
  if (!pending) {
    let assigned = bdrUserId;
    if (assigned == null && productId != null) {
      const opp = await get<{ owner_user_id: number | null }>(
        `
          SELECT owner_user_id FROM opportunities
          WHERE client_id = @clientId AND product_id = @productId AND outcome = 'open'
          ORDER BY updated_at DESC LIMIT 1
        `,
        { clientId, productId }
      );
      assigned = opp?.owner_user_id ?? null;
    }
    if (assigned == null) {
      const client = await get<{ bdr_user_id: number | null }>(
        "SELECT bdr_user_id FROM clients WHERE id = @clientId",
        { clientId }
      );
      assigned = client?.bdr_user_id ?? actorUserId;
    }
    await run(
      `
        INSERT INTO follow_ups (
          client_id, product_id, kind, assigned_user_id, created_by_user_id,
          scheduled_at, status, notes, created_at, updated_at
        ) VALUES (
          @clientId, @productId, 'return', @assignedUserId, @createdBy,
          @scheduledAt, 'pending', @notes, @now, @now
        )
      `,
      {
        clientId,
        productId,
        assignedUserId: assigned,
        createdBy: actorUserId,
        scheduledAt: spDayStartUtcIso(),
        notes: "Retorno após cancelamento de reunião",
        now
      }
    );
  }

  let opp =
    opportunityId != null
      ? await get<{ id: number; row_version: number; pipeline_stage_id: number | null }>(
          "SELECT id, row_version, pipeline_stage_id FROM opportunities WHERE id = @id AND outcome = 'open'",
          { id: opportunityId }
        )
      : null;

  if (!opp && productId != null) {
    opp = await get<{ id: number; row_version: number; pipeline_stage_id: number | null }>(
      `
        SELECT id, row_version, pipeline_stage_id FROM opportunities
        WHERE client_id = @clientId AND product_id = @productId AND outcome = 'open'
        ORDER BY updated_at DESC LIMIT 1
      `,
      { clientId, productId }
    );
  }

  const prospeccaoStageId = await getDefaultStageId(PROSPECCAO_PIPELINE_STAGE_NAME);
  if (opp && prospeccaoStageId && opp.pipeline_stage_id !== prospeccaoStageId) {
    try {
      await moveOpportunityStage({
        opportunity_id: opp.id,
        to_stage_id: prospeccaoStageId,
        user_id: actorUserId,
        expected_version: opp.row_version,
        notes: "Reunião cancelada — retorno à prospecção"
      });
    } catch {
      /* não bloqueia cancelamento da reunião */
    }
  }

  if (productId != null) {
    await run(
      `
        UPDATE opportunities SET next_action_at = NULL, updated_at = @now
        WHERE client_id = @clientId AND product_id = @productId AND outcome = 'open'
      `,
      { clientId, productId, now }
    );
  } else {
    await run(
      `
        UPDATE opportunities SET next_action_at = NULL, updated_at = @now
        WHERE client_id = @clientId AND outcome = 'open'
      `,
      { clientId, now }
    );
  }
}
