import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { bucketKeyForApproach, periodToRange, spDayEndUtcIso, spDayStartUtcIso, type DashboardPeriod } from "@/lib/datetime";
import { getOpportunityDashboardMetrics } from "@/lib/opportunity-pipeline";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();

  const url = new URL(request.url);
  const productId = url.searchParams.get("product_id");
  const bdrUserId = url.searchParams.get("bdr_user_id");
  const ownerUserId = url.searchParams.get("owner_user_id");
  const period = (url.searchParams.get("period") ?? "7d") as DashboardPeriod;
  const range = periodToRange(period);
  const leadQualParam = url.searchParams.get("lead_qualification");
  const leadQual =
    leadQualParam === "cold" || leadQualParam === "warm" || leadQualParam === "hot" ? leadQualParam : null;

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
  if (leadQual) {
    clientFilter += " AND c.lead_qualification = @leadQualification";
    params.leadQualification = leadQual;
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

  const approachesTotal = byChannel.reduce((sum, r) => sum + Number(r.count), 0);

  const qualRows = await all<{ lead_qualification: string; count: string }>(
    `
      SELECT c.lead_qualification, COUNT(*)::text AS count
      FROM clients c
      WHERE ${clientFilter}
      GROUP BY c.lead_qualification
    `,
    params
  );
  const qualMap = { cold: 0, warm: 0, hot: 0 };
  for (const row of qualRows) {
    if (row.lead_qualification === "warm") qualMap.warm = Number(row.count);
    else if (row.lead_qualification === "hot") qualMap.hot = Number(row.count);
    else qualMap.cold += Number(row.count);
  }

  const todayStart = spDayStartUtcIso();
  const todayEnd = spDayEndUtcIso();
  const focusParams = { ...params, todayStart, todayEnd };

  const returnsOverdueRow = await get<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count FROM follow_ups f
      JOIN clients c ON c.id = f.client_id
      WHERE f.status = 'pending' AND f.scheduled_at < @todayStart
      AND ${clientFilter}
      ${productId ? " AND f.product_id = @productId" : ""}
      ${bdrUserId ? " AND f.assigned_user_id = @bdrUserId" : ""}
    `,
    focusParams
  );
  const returnsTodayRow = await get<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count FROM follow_ups f
      JOIN clients c ON c.id = f.client_id
      WHERE f.status = 'pending' AND f.scheduled_at >= @todayStart AND f.scheduled_at <= @todayEnd
      AND ${clientFilter}
      ${productId ? " AND f.product_id = @productId" : ""}
      ${bdrUserId ? " AND f.assigned_user_id = @bdrUserId" : ""}
    `,
    focusParams
  );
  const weekEnd = spDayEndUtcIso(new Date(Date.now() + 6 * 86400000));
  const upcomingParams = { ...focusParams, weekEnd };

  const meetingsTodayRow = await get<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count FROM meetings m
      JOIN clients c ON c.id = m.client_id
      WHERE m.starts_at >= @todayStart AND m.starts_at <= @todayEnd
        AND m.status IN ('scheduled', 'confirmed')
        AND ${clientFilter}
        ${productId ? " AND m.product_id = @productId" : ""}
        ${bdrUserId ? " AND m.bdr_user_id = @bdrUserId" : ""}
    `,
    focusParams
  );

  const meetingsUpcomingRow = await get<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count FROM meetings m
      JOIN clients c ON c.id = m.client_id
      WHERE m.starts_at >= @todayStart AND m.starts_at <= @weekEnd
        AND m.status IN ('scheduled', 'confirmed')
        AND ${clientFilter}
        ${productId ? " AND m.product_id = @productId" : ""}
        ${bdrUserId ? " AND m.bdr_user_id = @bdrUserId" : ""}
    `,
    upcomingParams
  );

  const focusReturns = await all<{
    id: number;
    client_id: number;
    client_name: string;
    scheduled_at: string;
    kind: string;
  }>(
    `
      SELECT f.id, f.client_id,
        COALESCE(c.trade_name, c.legal_name, 'Cliente') AS client_name,
        f.scheduled_at, f.kind
      FROM follow_ups f
      JOIN clients c ON c.id = f.client_id
      WHERE f.status = 'pending'
        AND (
          f.scheduled_at < @todayEnd
        )
        AND ${clientFilter}
        ${productId ? " AND f.product_id = @productId" : ""}
        ${bdrUserId ? " AND f.assigned_user_id = @bdrUserId" : ""}
      ORDER BY f.scheduled_at ASC
      LIMIT 6
    `,
    focusParams
  );

  const focusMeetings = await all<{
    id: number;
    client_id: number;
    title: string;
    client_name: string;
    starts_at: string;
  }>(
    `
      SELECT m.id, m.client_id, m.title, m.starts_at,
        COALESCE(c.trade_name, c.legal_name, 'Cliente') AS client_name
      FROM meetings m
      JOIN clients c ON c.id = m.client_id
      WHERE m.starts_at >= @todayStart AND m.starts_at <= @todayEnd
        AND m.status IN ('scheduled', 'confirmed')
        AND ${clientFilter}
        ${productId ? " AND m.product_id = @productId" : ""}
        ${bdrUserId ? " AND m.bdr_user_id = @bdrUserId" : ""}
      ORDER BY m.starts_at ASC
      LIMIT 4
    `,
    focusParams
  );

  const focus_items = [
    ...focusReturns.map((f) => ({
      type: "return" as const,
      id: f.id,
      client_id: f.client_id,
      label: f.kind === "meeting" ? "Retorno reunião" : "Retomar conversa",
      client_name: f.client_name,
      at: f.scheduled_at,
      overdue: f.scheduled_at < todayStart
    })),
    ...focusMeetings.map((m) => ({
      type: "meeting" as const,
      id: m.id,
      client_id: m.client_id,
      label: "Reunião",
      client_name: m.client_name,
      at: m.starts_at,
      overdue: false
    }))
  ]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, 6);

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
    approaches_total: approachesTotal,
    returns_overdue: Number(returnsOverdueRow?.count ?? 0),
    returns_today: Number(returnsTodayRow?.count ?? 0),
    meetings_today: Number(meetingsTodayRow?.count ?? 0),
    meetings_upcoming: Number(meetingsUpcomingRow?.count ?? 0),
    qualification: qualMap,
    focus_items,
    period,
    activity_metrics_available: approachRows.length > 0
  });
}
