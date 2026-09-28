import { get, nowIso, run } from "@/lib/db";
import { spDayStartUtcIso } from "@/lib/datetime";

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
      UPDATE clients SET in_prospeccao_queue = true, bdr_user_id = @bdrUserId, updated_at = @now
      WHERE id = @clientId
    `,
    { clientId, bdrUserId, now }
  );

  await returnClientToProspeccaoQueue(clientId, actorUserId, productId);
}

/** Recoloca o cliente na fila de prospecção; se já houve abordagem, agenda retorno para hoje. */
export async function returnClientToProspeccaoQueue(
  clientId: number,
  actorUserId: number,
  productId?: number | null
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

  const client = await get<{ bdr_user_id: number | null }>(
    "SELECT bdr_user_id FROM clients WHERE id = @clientId",
    { clientId }
  );
  const assigned = client?.bdr_user_id ?? actorUserId;
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
      notes: "Retorno à prospecção ao criar oportunidade",
      now
    }
  );
}
