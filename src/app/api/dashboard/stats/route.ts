import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { bucketKeyForApproach, periodToRange, type DashboardPeriod } from "@/lib/datetime";
import { getOpportunityDashboardMetrics } from "@/lib/opportunity-pipeline";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();

  const url = new URL(request.url);
  const productId = url.searchParams.get("product_id");
  const bdrUserId = url.searchParams.get("bdr_user_id");
  const ownerUserId = url.searchParams.get("owner_user_id");
  const period = (url.searchParams.get("period") ?? "all") as DashboardPeriod;
  const range = periodToRange(period);

  let clientFilter = "1=1";
  let approachFilter = "1=1";
  let meetingFilter = "1=1";
  const params: Record<string, string | number> = {};

  if (productId) {
    clientFilter += " AND EXISTS (SELECT 1 FROM client_products cp WHERE cp.client_id = c.id AND cp.product_id = @productId)";
    approachFilter += " AND a.product_id = @productId";
    meetingFilter += " AND m.product_id = @productId";
    params.productId = Number(productId);
  }
  if (bdrUserId) {
    clientFilter += " AND c.bdr_user_id = @bdrUserId";
    approachFilter += " AND a.user_id = @bdrUserId";
    meetingFilter += " AND m.bdr_user_id = @bdrUserId";
    params.bdrUserId = Number(bdrUserId);
  }
  if (range.from) {
    approachFilter += " AND a.occurred_at >= @from";
    meetingFilter += " AND m.starts_at >= @from";
    params.from = range.from;
  }
  if (range.to) {
    approachFilter += " AND a.occurred_at <= @to";
    meetingFilter += " AND m.starts_at <= @to";
    params.to = range.to;
  }

  const totalRow = await get<{ count: string }>(`SELECT COUNT(*)::text AS count FROM clients c WHERE ${clientFilter}`, params);

  const verifiedRow = await get<{ count: string }>(
    `
      SELECT COUNT(DISTINCT c.id)::text AS count
      FROM clients c
      JOIN contacts ct ON ct.client_id = c.id AND ct.verification_status = 'confirmed'
      WHERE ${clientFilter}
    `,
    params
  );

  const withoutApproachRow = await get<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count FROM clients c
      WHERE ${clientFilter}
        AND NOT EXISTS (SELECT 1 FROM approaches a WHERE a.client_id = c.id)
    `,
    params
  );

  const byBdr = await all<{ bdr_user_id: number | null; bdr_name: string | null; count: string }>(
    `
      SELECT c.bdr_user_id, u.name AS bdr_name, COUNT(*)::text AS count
      FROM clients c
      LEFT JOIN users u ON u.id = c.bdr_user_id
      WHERE ${clientFilter}
      GROUP BY c.bdr_user_id, u.name
      ORDER BY count DESC, u.name
    `,
    params
  );

  const uniqueClientsTried = await get<{ count: string }>(
    `
      SELECT COUNT(DISTINCT a.client_id)::text AS count
      FROM approaches a
      JOIN clients c ON c.id = a.client_id
      WHERE ${approachFilter}
    `,
    params
  );

  const byChannel = await all<{ channel: string; count: string }>(
    `
      SELECT a.channel, COUNT(*)::text AS count
      FROM approaches a
      JOIN clients c ON c.id = a.client_id
      WHERE ${approachFilter}
      GROUP BY a.channel
    `,
    params
  );

  const byResult = await all<{ result_name: string; count: string }>(
    `
      SELECT COALESCE(rt.name, 'Sem resultado') AS result_name, COUNT(*)::text AS count
      FROM approaches a
      JOIN clients c ON c.id = a.client_id
      LEFT JOIN approach_result_types rt ON rt.id = a.result_type_id
      WHERE ${approachFilter} AND a.channel = 'call'
      GROUP BY rt.name
      ORDER BY count DESC
    `,
    params
  );

  const pendingReturns = await get<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count FROM follow_ups f
      JOIN clients c ON c.id = f.client_id
      WHERE f.status = 'pending'
      ${productId ? " AND f.product_id = @productId" : ""}
      ${bdrUserId ? " AND f.assigned_user_id = @bdrUserId" : ""}
    `,
    params
  );

  const approachesByBdr = await all<{ user_name: string; count: string }>(
    `
      SELECT u.name AS user_name, COUNT(*)::text AS count
      FROM approaches a
      JOIN users u ON u.id = a.user_id
      JOIN clients c ON c.id = a.client_id
      WHERE ${approachFilter}
      GROUP BY u.name
      ORDER BY count DESC
    `,
    params
  );

  const approachRows = await all<{ occurred_at: string }>(
    `
      SELECT a.occurred_at
      FROM approaches a
      JOIN clients c ON c.id = a.client_id
      WHERE ${approachFilter}
    `,
    params
  );

  const seriesMap = new Map<string, number>();
  for (const row of approachRows) {
    const key = bucketKeyForApproach(row.occurred_at, period);
    seriesMap.set(key, (seriesMap.get(key) ?? 0) + 1);
  }
  const approaches_series = [...seriesMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, count]) => ({ label, count }));

  const meetingsScheduled = await get<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM meetings m WHERE ${meetingFilter} AND m.status IN ('scheduled', 'confirmed')`,
    params
  );
  const meetingsConfirmed = await get<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM meetings m WHERE ${meetingFilter} AND m.status = 'confirmed'`,
    params
  );
  const meetingsHeld = await get<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM meetings m WHERE ${meetingFilter} AND m.status = 'held'`,
    params
  );
  const meetingsNoShow = await get<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM meetings m WHERE ${meetingFilter} AND m.status = 'no_show'`,
    params
  );

  const oppMetrics = await getOpportunityDashboardMetrics({
    period,
    product_id: productId ? Number(productId) : undefined,
    owner_user_id: ownerUserId ? Number(ownerUserId) : bdrUserId ? Number(bdrUserId) : undefined
  });

  return Response.json({
    total_clients: Number(totalRow?.count ?? 0),
    clients_with_verified_phone: Number(verifiedRow?.count ?? 0),
    clients_without_approach: Number(withoutApproachRow?.count ?? 0),
    clients_by_bdr: byBdr.map((row) => ({
      bdr_user_id: row.bdr_user_id,
      bdr_name: row.bdr_name ?? "Sem BDR",
      count: Number(row.count)
    })),
    unique_clients_attempted: Number(uniqueClientsTried?.count ?? 0),
    approaches_by_channel: byChannel.map((r) => ({ channel: r.channel, count: Number(r.count) })),
    call_results: byResult.map((r) => ({ result: r.result_name, count: Number(r.count) })),
    pending_returns: Number(pendingReturns?.count ?? 0),
    approaches_by_bdr: approachesByBdr.map((r) => ({ bdr_name: r.user_name, count: Number(r.count) })),
    approaches_series,
    meetings_scheduled: Number(meetingsScheduled?.count ?? 0),
    meetings_confirmed: Number(meetingsConfirmed?.count ?? 0),
    meetings_held: Number(meetingsHeld?.count ?? 0),
    meetings_no_show: Number(meetingsNoShow?.count ?? 0),
    ...oppMetrics,
    period,
    activity_metrics_available: approachRows.length > 0
  });
}
