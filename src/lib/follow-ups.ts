import { all, get, nowIso, run } from "@/lib/db";
import { spDayEndUtcIso, spDayStartUtcIso } from "@/lib/datetime";

export type FollowUpSection = "overdue" | "today" | "upcoming" | "completed";

export async function reassignPendingFollowUpsForClients(clientIds: number[], newBdrUserId: number) {
  if (!clientIds.length) return 0;
  const ids = clientIds.filter(Number.isInteger).join(",");
  const rows = await all<{ id: number }>(
    `UPDATE follow_ups SET assigned_user_id = @bdr, updated_at = @now
     WHERE status = 'pending' AND client_id IN (${ids})
     RETURNING id`,
    { bdr: newBdrUserId, now: nowIso() }
  );
  return rows.length;
}

export async function listFollowUps(options: {
  section: FollowUpSection;
  bdr_user_id?: number;
  product_id?: number;
  period_from?: string | null;
  period_to?: string | null;
}) {
  const todayStart = spDayStartUtcIso();
  const todayEnd = spDayEndUtcIso();
  const where: string[] = ["1=1"];
  const params: Record<string, string | number> = {};

  if (options.bdr_user_id) {
    where.push("f.assigned_user_id = @bdrUserId");
    params.bdrUserId = options.bdr_user_id;
  }
  if (options.product_id) {
    where.push("f.product_id = @productId");
    params.productId = options.product_id;
  }

  if (options.section === "completed") {
    where.push("f.status = 'completed'");
  } else if (options.section === "overdue") {
    where.push("f.status = 'pending' AND f.scheduled_at < @todayStart");
    params.todayStart = todayStart;
  } else if (options.section === "today") {
    where.push("f.status = 'pending' AND f.scheduled_at >= @todayStart AND f.scheduled_at <= @todayEnd");
    params.todayStart = todayStart;
    params.todayEnd = todayEnd;
  } else {
    where.push("f.status = 'pending' AND f.scheduled_at > @todayEnd");
    params.todayEnd = todayEnd;
  }

  if (options.period_from) {
    where.push("f.scheduled_at >= @periodFrom");
    params.periodFrom = options.period_from;
  }
  if (options.period_to) {
    where.push("f.scheduled_at <= @periodTo");
    params.periodTo = options.period_to;
  }

  return all<{
    id: number;
    client_id: number;
    client_name: string;
    contact_name: string | null;
    product_name: string | null;
    scheduled_at: string;
    notes: string | null;
    assigned_user_name: string;
    created_by_user_name: string;
    source_approach_id: number | null;
    kind: string;
    status: string;
  }>(
    `
      SELECT
        f.id,
        f.client_id,
        COALESCE(c.trade_name, c.legal_name, 'Cliente') AS client_name,
        ct.name AS contact_name,
        p.name AS product_name,
        f.scheduled_at,
        f.notes,
        au.name AS assigned_user_name,
        cu.name AS created_by_user_name,
        f.source_approach_id,
        f.kind,
        f.status
      FROM follow_ups f
      JOIN clients c ON c.id = f.client_id
      LEFT JOIN contacts ct ON ct.id = f.contact_id
      LEFT JOIN products p ON p.id = f.product_id
      JOIN users au ON au.id = f.assigned_user_id
      JOIN users cu ON cu.id = f.created_by_user_id
      WHERE ${where.join(" AND ")}
      ORDER BY f.scheduled_at ASC, f.id ASC
      LIMIT 200
    `,
    params
  );
}

export async function getFollowUpDetail(id: number) {
  const row = await get<{
    id: number;
    client_id: number;
    status: string;
    notes: string | null;
    scheduled_at: string;
    source_approach_id: number | null;
  }>("SELECT * FROM follow_ups WHERE id = @id", { id });
  if (!row) return null;

  const lastApproach = await get<{
    id: number;
    channel: string;
    occurred_at: string;
    notes: string | null;
    result_name: string | null;
    user_name: string | null;
  }>(
    `
      SELECT a.id, a.channel, a.occurred_at, a.notes, rt.name AS result_name, u.name AS user_name
      FROM approaches a
      LEFT JOIN approach_result_types rt ON rt.id = a.result_type_id
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.client_id = @clientId
      ORDER BY a.occurred_at DESC, a.id DESC
      LIMIT 1
    `,
    { clientId: row.client_id }
  );

  return { follow_up: row, last_approach: lastApproach };
}

export async function completeFollowUp(id: number, userId: number, completionApproachId?: number) {
  await run(
    `
      UPDATE follow_ups SET
        status = 'completed',
        completed_at = @now,
        completed_by_user_id = @userId,
        completion_approach_id = @approachId,
        updated_at = @now
      WHERE id = @id AND status = 'pending'
    `,
    { id, userId, approachId: completionApproachId ?? null, now: nowIso() }
  );
}
