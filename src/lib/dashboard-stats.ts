import { all, get } from "@/lib/db";
import { bucketKeyForApproach, periodToRange, spDayEndUtcIso, spDayStartUtcIso, type DashboardPeriod } from "@/lib/datetime";
import { getOpportunityDashboardMetrics } from "@/lib/opportunity-pipeline";

export type DashboardStatsFilters = {
  period?: DashboardPeriod;
  product_id?: string | null;
  bdr_user_id?: string | null;
  owner_user_id?: string | null;
  lead_qualification?: "cold" | "warm" | "hot" | null;
};

export type DashboardStatsPayload = {
  total_clients: number;
  clients_with_verified_phone: number;
  clients_without_approach: number;
  clients_by_bdr: Array<{ bdr_user_id: number | null; bdr_name: string; count: number }>;
  unique_clients_attempted: number;
  approaches_by_channel: Array<{ channel: string; count: number }>;
  call_results: Array<{ result: string; count: number }>;
  pending_returns: number;
  approaches_by_bdr: Array<{ bdr_name: string; count: number }>;
  approaches_series: Array<{ label: string; count: number }>;
  approaches_timeline: {
    labels: string[];
    series: Array<{ channel: string; values: number[] }>;
  };
  clients_reached: number;
  bdr_activity: Array<{ bdr_name: string; approaches: number; meetings: number; clients: number }>;
  meetings_scheduled: number;
  meetings_confirmed: number;
  meetings_held: number;
  meetings_no_show: number;
  open_opportunities: number;
  proposals_sent: number;
  deals_converted: number;
  approaches_total: number;
  returns_overdue: number;
  returns_today: number;
  meetings_today: number;
  meetings_upcoming: number;
  qualification: { cold: number; warm: number; hot: number };
  focus_items: Array<{
    type: "return" | "meeting";
    id: number;
    client_id: number;
    label: string;
    client_name: string;
    at: string;
    overdue: boolean;
  }>;
  period: DashboardPeriod;
  activity_metrics_available: boolean;
};

function buildFilters(input: DashboardStatsFilters) {
  const period = input.period ?? "7d";
  const range = periodToRange(period);
  const productId = input.product_id?.trim() || null;
  const bdrUserId = input.bdr_user_id?.trim() || null;
  const ownerUserId = input.owner_user_id?.trim() || null;
  const leadQual = input.lead_qualification ?? null;

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

  return { period, productId, bdrUserId, ownerUserId, clientFilter, approachFilter, meetingFilter, params };
}

export async function loadDashboardStats(input: DashboardStatsFilters = {}): Promise<DashboardStatsPayload> {
  const { period, productId, bdrUserId, ownerUserId, clientFilter, approachFilter, meetingFilter, params } =
    buildFilters(input);

  const todayStart = spDayStartUtcIso();
  const todayEnd = spDayEndUtcIso();
  const weekEnd = spDayEndUtcIso(new Date(Date.now() + 6 * 86400000));
  const focusParams = { ...params, todayStart, todayEnd };
  const upcomingParams = { ...focusParams, weekEnd };

  const bdrActivitySql = `
    WITH bdr_users AS (
      SELECT u.id, u.name AS bdr_name
      FROM users u
      WHERE (
        EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role = 'bdr')
        OR EXISTS (SELECT 1 FROM approaches a2 WHERE a2.user_id = u.id)
      )
      ${bdrUserId ? "AND u.id = @bdrUserId" : ""}
    ),
    approach_counts AS (
      SELECT a.user_id, COUNT(*)::text AS cnt
      FROM approaches a
      JOIN clients c ON c.id = a.client_id
      WHERE ${approachFilter}
      GROUP BY a.user_id
    ),
    meeting_counts AS (
      SELECT m.bdr_user_id AS user_id, COUNT(*)::text AS cnt
      FROM meetings m
      JOIN clients c ON c.id = m.client_id
      WHERE ${meetingFilter}
      GROUP BY m.bdr_user_id
    ),
    client_counts AS (
      SELECT c.bdr_user_id AS user_id, COUNT(*)::text AS cnt
      FROM clients c
      WHERE c.bdr_user_id IS NOT NULL AND ${clientFilter}
      GROUP BY c.bdr_user_id
    )
    SELECT
      bu.bdr_name,
      COALESCE(ac.cnt, '0') AS approaches,
      COALESCE(mc.cnt, '0') AS meetings,
      COALESCE(cc.cnt, '0') AS clients
    FROM bdr_users bu
    LEFT JOIN approach_counts ac ON ac.user_id = bu.id
    LEFT JOIN meeting_counts mc ON mc.user_id = bu.id
    LEFT JOIN client_counts cc ON cc.user_id = bu.id
    ORDER BY COALESCE(NULLIF(ac.cnt, '0')::int, 0) DESC, bu.bdr_name
    LIMIT 12
  `;

  const [
    totalRow,
    verifiedRow,
    withoutApproachRow,
    byBdr,
    uniqueClientsTried,
    byChannel,
    byResult,
    pendingReturns,
    approachesByBdr,
    approachRows,
    clientsReachedRow,
    bdrActivity,
    meetingsScheduled,
    meetingsConfirmed,
    meetingsHeld,
    meetingsNoShow,
    qualRows,
    returnsOverdueRow,
    returnsTodayRow,
    meetingsTodayRow,
    meetingsUpcomingRow,
    focusReturns,
    focusMeetings
  ] = await Promise.all([
    get<{ count: string }>(`SELECT COUNT(*)::text AS count FROM clients c WHERE ${clientFilter}`, params),
    get<{ count: string }>(
      `
        SELECT COUNT(DISTINCT c.id)::text AS count
        FROM clients c
        JOIN contacts ct ON ct.client_id = c.id AND ct.verification_status = 'confirmed'
        WHERE ${clientFilter}
      `,
      params
    ),
    get<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count FROM clients c
        WHERE ${clientFilter}
          AND NOT EXISTS (SELECT 1 FROM approaches a WHERE a.client_id = c.id)
      `,
      params
    ),
    all<{ bdr_user_id: number | null; bdr_name: string | null; count: string }>(
      `
        SELECT c.bdr_user_id, u.name AS bdr_name, COUNT(*)::text AS count
        FROM clients c
        LEFT JOIN users u ON u.id = c.bdr_user_id
        WHERE ${clientFilter}
        GROUP BY c.bdr_user_id, u.name
        ORDER BY count DESC, u.name
      `,
      params
    ),
    get<{ count: string }>(
      `
        SELECT COUNT(DISTINCT a.client_id)::text AS count
        FROM approaches a
        JOIN clients c ON c.id = a.client_id
        WHERE ${approachFilter}
      `,
      params
    ),
    all<{ channel: string; count: string }>(
      `
        SELECT a.channel, COUNT(*)::text AS count
        FROM approaches a
        JOIN clients c ON c.id = a.client_id
        WHERE ${approachFilter}
        GROUP BY a.channel
      `,
      params
    ),
    all<{ result_name: string; count: string }>(
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
    ),
    get<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count FROM follow_ups f
        JOIN clients c ON c.id = f.client_id
        WHERE f.status = 'pending'
        ${productId ? " AND f.product_id = @productId" : ""}
        ${bdrUserId ? " AND f.assigned_user_id = @bdrUserId" : ""}
      `,
      params
    ),
    all<{ user_name: string; count: string }>(
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
    ),
    all<{ occurred_at: string; channel: string }>(
      `
        SELECT a.occurred_at, a.channel
        FROM approaches a
        JOIN clients c ON c.id = a.client_id
        WHERE ${approachFilter}
      `,
      params
    ),
    get<{ count: string }>(
      `
        SELECT COUNT(DISTINCT a.client_id)::text AS count
        FROM approaches a
        JOIN clients c ON c.id = a.client_id
        JOIN approach_result_types rt ON rt.id = a.result_type_id
        WHERE ${approachFilter}
          AND rt.slug IN (
            'falou_responsavel', 'falou_outra_pessoa', 'demonstrou_interesse',
            'pediu_retorno', 'reuniao_agendada'
          )
      `,
      params
    ),
    all<{ bdr_name: string; approaches: string; meetings: string; clients: string }>(bdrActivitySql, params),
    get<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM meetings m WHERE ${meetingFilter} AND m.status IN ('scheduled', 'confirmed')`,
      params
    ),
    get<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM meetings m WHERE ${meetingFilter} AND m.status = 'confirmed'`,
      params
    ),
    get<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM meetings m WHERE ${meetingFilter} AND m.status = 'held'`,
      params
    ),
    get<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM meetings m WHERE ${meetingFilter} AND m.status = 'no_show'`,
      params
    ),
    all<{ lead_qualification: string; count: string }>(
      `
        SELECT c.lead_qualification, COUNT(*)::text AS count
        FROM clients c
        WHERE ${clientFilter}
        GROUP BY c.lead_qualification
      `,
      params
    ).catch(() => [] as Array<{ lead_qualification: string; count: string }>),
    get<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count FROM follow_ups f
        JOIN clients c ON c.id = f.client_id
        WHERE f.status = 'pending' AND f.scheduled_at < @todayStart
        AND ${clientFilter}
        ${productId ? " AND f.product_id = @productId" : ""}
        ${bdrUserId ? " AND f.assigned_user_id = @bdrUserId" : ""}
      `,
      focusParams
    ),
    get<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count FROM follow_ups f
        JOIN clients c ON c.id = f.client_id
        WHERE f.status = 'pending' AND f.scheduled_at >= @todayStart AND f.scheduled_at <= @todayEnd
        AND ${clientFilter}
        ${productId ? " AND f.product_id = @productId" : ""}
        ${bdrUserId ? " AND f.assigned_user_id = @bdrUserId" : ""}
      `,
      focusParams
    ),
    get<{ count: string }>(
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
    ),
    get<{ count: string }>(
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
    ),
    all<{
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
          AND f.scheduled_at < @todayEnd
          AND ${clientFilter}
          ${productId ? " AND f.product_id = @productId" : ""}
          ${bdrUserId ? " AND f.assigned_user_id = @bdrUserId" : ""}
        ORDER BY f.scheduled_at ASC
        LIMIT 6
      `,
      focusParams
    ),
    all<{
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
    )
  ]);

  const seriesMap = new Map<string, number>();
  const channelSeries = new Map<string, Map<string, number>>();
  for (const row of approachRows) {
    const key = bucketKeyForApproach(row.occurred_at, period);
    seriesMap.set(key, (seriesMap.get(key) ?? 0) + 1);
    const ch = row.channel || "call";
    if (!channelSeries.has(ch)) channelSeries.set(ch, new Map());
    const bucket = channelSeries.get(ch)!;
    bucket.set(key, (bucket.get(key) ?? 0) + 1);
  }
  const approaches_series = [...seriesMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, count]) => ({ label, count }));

  const timelineLabels = [...new Set([...seriesMap.keys()])].sort((a, b) => a.localeCompare(b));
  const channelOrder = ["call", "whatsapp", "email"] as const;
  const approaches_timeline = {
    labels: timelineLabels,
    series: channelOrder.map((channel) => ({
      channel,
      values: timelineLabels.map((label) => channelSeries.get(channel)?.get(label) ?? 0)
    }))
  };

  let oppMetrics = { open_opportunities: 0, proposals_sent: 0, deals_converted: 0 };
  try {
    oppMetrics = await getOpportunityDashboardMetrics({
      period,
      product_id: productId ? Number(productId) : undefined,
      owner_user_id: ownerUserId ? Number(ownerUserId) : bdrUserId ? Number(bdrUserId) : undefined
    });
  } catch (e) {
    console.error("[dashboard-stats] opportunity metrics", e);
  }

  const qualMap = { cold: 0, warm: 0, hot: 0 };
  for (const row of qualRows) {
    if (row.lead_qualification === "warm") qualMap.warm = Number(row.count);
    else if (row.lead_qualification === "hot") qualMap.hot = Number(row.count);
    else qualMap.cold += Number(row.count);
  }

  const approachesTotal = byChannel.reduce((sum, r) => sum + Number(r.count), 0);

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

  return {
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
    approaches_timeline,
    clients_reached: Number(clientsReachedRow?.count ?? 0),
    bdr_activity: bdrActivity.map((row) => ({
      bdr_name: row.bdr_name,
      approaches: Number(row.approaches),
      meetings: Number(row.meetings),
      clients: Number(row.clients)
    })),
    meetings_scheduled: Number(meetingsScheduled?.count ?? 0),
    meetings_confirmed: Number(meetingsConfirmed?.count ?? 0),
    meetings_held: Number(meetingsHeld?.count ?? 0),
    meetings_no_show: Number(meetingsNoShow?.count ?? 0),
    open_opportunities: oppMetrics.open_opportunities,
    proposals_sent: oppMetrics.proposals_sent,
    deals_converted: oppMetrics.deals_converted,
    approaches_total: approachesTotal,
    returns_overdue: Number(returnsOverdueRow?.count ?? 0),
    returns_today: Number(returnsTodayRow?.count ?? 0),
    meetings_today: Number(meetingsTodayRow?.count ?? 0),
    meetings_upcoming: Number(meetingsUpcomingRow?.count ?? 0),
    qualification: qualMap,
    focus_items,
    period,
    activity_metrics_available: approachRows.length > 0
  };
}

export function dashboardStatsFromSearchParams(searchParams: URLSearchParams): DashboardStatsFilters {
  const leadQualParam = searchParams.get("lead_qualification");
  const leadQual =
    leadQualParam === "cold" || leadQualParam === "warm" || leadQualParam === "hot" ? leadQualParam : null;
  return {
    period: (searchParams.get("period") ?? "7d") as DashboardPeriod,
    product_id: searchParams.get("product_id"),
    bdr_user_id: searchParams.get("bdr_user_id"),
    owner_user_id: searchParams.get("owner_user_id"),
    lead_qualification: leadQual
  };
}
