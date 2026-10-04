import { all, get } from "@/lib/db";
import { periodToRange, spCurrentWeekDayLabels, spDayEndUtcIso, spDayStartUtcIso, type DashboardPeriod } from "@/lib/datetime";
import { getOpportunityDashboardMetrics } from "@/lib/opportunity-pipeline";
import type {
  DashboardProductBreakdownRow,
  DashboardStatsFilters,
  DashboardStatsPayload,
  DashboardWhatsAppReport
} from "@/lib/dashboard-stats-types";

export type {
  DashboardProductBreakdownRow,
  DashboardStatsFilters,
  DashboardStatsPayload,
  DashboardWhatsAppReport
} from "@/lib/dashboard-stats-types";

function timestampIso(value: string | Date | null | undefined): string {
  if (value == null) return "";
  return typeof value === "string" ? value : new Date(value).toISOString();
}

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

/** Evita estourar o pool Postgres (serverless) com dezenas de queries simultâneas. */
async function runQueriesLimited(tasks: Array<() => Promise<unknown>>, concurrency = 3): Promise<unknown[]> {
  const results: unknown[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  const workers = Math.min(concurrency, tasks.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

async function loadProductsBreakdown(
  clientFilter: string,
  approachFilter: string,
  params: Record<string, string | number>
): Promise<DashboardProductBreakdownRow[]> {
  const rows = await all<{
    product_id: string;
    product_name: string;
    clients_available: string;
    leads_worked_period: string;
    calls_made_period: string;
  }>(
    `
    SELECT
      p.id::text AS product_id,
      p.name AS product_name,
      COALESCE(av.cnt, 0)::text AS clients_available,
      COALESCE(ap.leads, 0)::text AS leads_worked_period,
      COALESCE(ap.calls, 0)::text AS calls_made_period
    FROM products p
    LEFT JOIN (
      SELECT cpp.product_id, COUNT(DISTINCT cpp.client_id)::int AS cnt
      FROM client_product_prospeccao cpp
      JOIN clients c ON c.id = cpp.client_id
      WHERE cpp.in_prospeccao_queue = true AND ${clientFilter}
      GROUP BY cpp.product_id
    ) av ON av.product_id = p.id
    LEFT JOIN (
      SELECT a.product_id,
        COUNT(DISTINCT a.client_id)::int AS leads,
        COUNT(*)::int AS calls
      FROM approaches a
      JOIN clients c ON c.id = a.client_id
      WHERE ${approachFilter} AND a.channel = 'call' AND a.product_id IS NOT NULL
      GROUP BY a.product_id
    ) ap ON ap.product_id = p.id
    ORDER BY p.name ASC
    `,
    params
  );

  return rows.map((r) => ({
    product_id: Number(r.product_id),
    product_name: r.product_name,
    clients_available: Number(r.clients_available),
    leads_worked_period: Number(r.leads_worked_period),
    calls_made_period: Number(r.calls_made_period)
  }));
}

async function loadWhatsAppReport(
  approachFilter: string,
  meetingFilter: string,
  params: Record<string, string | number>,
  period: DashboardPeriod,
  meetingsScheduled: number,
  meetingsToday: number,
  decisionMakerContacts: number
): Promise<DashboardWhatsAppReport> {
  const callAgg = await get<{
    leads_worked: string;
    calls_made: string;
    calls_rang: string;
    calls_answered: string;
    call_error: string;
    call_no_answer: string;
  }>(
    `
    SELECT
      COUNT(DISTINCT a.client_id)::text AS leads_worked,
      COUNT(*)::text AS calls_made,
      COUNT(*) FILTER (WHERE tr.slug IS NOT NULL AND tr.slug <> 'call_failed')::text AS calls_rang,
      COUNT(*) FILTER (WHERE tr.answered = true OR tr.slug = 'answered')::text AS calls_answered,
      COUNT(*) FILTER (WHERE tr.slug = 'call_failed')::text AS call_error,
      COUNT(*) FILTER (WHERE tr.slug IN ('no_answer', 'busy'))::text AS call_no_answer
    FROM approaches a
    JOIN clients c ON c.id = a.client_id
    LEFT JOIN api4com_calls ac ON ac.approach_id = a.id
    LEFT JOIN call_technical_result_types tr ON tr.id = ac.technical_result_type_id
    WHERE ${approachFilter} AND a.channel = 'call'
  `,
    params
  );

  const slugRows = await all<{ slug: string; count: string }>(
    `
    SELECT rt.slug, COUNT(*)::text AS count
    FROM approaches a
    JOIN clients c ON c.id = a.client_id
    JOIN approach_result_types rt ON rt.id = a.result_type_id
    WHERE ${approachFilter} AND a.channel = 'call'
      AND rt.slug IN ('sem_interesse', 'falou_outra_pessoa', 'pediu_retorno', 'reuniao_agendada')
    GROUP BY rt.slug
  `,
    params
  );

  const bySlug = Object.fromEntries(slugRows.map((r) => [r.slug, Number(r.count)]));

  const meetingRows = await all<{ product_name: string; count: string }>(
    `
    SELECT COALESCE(p.name, 'Sem produto') AS product_name, COUNT(*)::text AS count
    FROM meetings m
    JOIN clients c ON c.id = m.client_id
    LEFT JOIN products p ON p.id = m.product_id
    WHERE ${meetingFilter} AND m.status IN ('scheduled', 'confirmed')
    GROUP BY p.id, p.name
    HAVING COUNT(*) > 0
    ORDER BY p.name ASC
    `,
    params
  );

  return {
    leads_worked: Number(callAgg?.leads_worked ?? 0),
    calls_made: Number(callAgg?.calls_made ?? 0),
    calls_rang: Number(callAgg?.calls_rang ?? 0),
    calls_answered: Number(callAgg?.calls_answered ?? 0),
    decision_maker_contacts: decisionMakerContacts,
    call_error: Number(callAgg?.call_error ?? 0),
    call_no_answer: Number(callAgg?.call_no_answer ?? 0),
    no_interest: bySlug.sem_interesse ?? 0,
    gatekeeper_block: bySlug.falou_outra_pessoa ?? 0,
    return_requested: bySlug.pediu_retorno ?? 0,
    meetings_scheduled: meetingsScheduled,
    meetings_today: meetingsToday,
    period_key: period,
    meetings_by_product: meetingRows.map((r) => ({
      product_name: r.product_name,
      count: Number(r.count)
    }))
  };
}

export async function loadDashboardStats(input: DashboardStatsFilters = {}): Promise<DashboardStatsPayload> {
  const { period, productId, bdrUserId, ownerUserId, clientFilter, approachFilter, meetingFilter, params } =
    buildFilters(input);

  const todayStart = spDayStartUtcIso();
  const todayEnd = spDayEndUtcIso();
  const weekEnd = spDayEndUtcIso(new Date(Date.now() + 6 * 86400000));
  const focusParams = { ...params, todayStart, todayEnd };
  const upcomingParams = { ...focusParams, weekEnd };
  const timelineParams = { ...params, useMonthBuckets: period === "all" ? 1 : 0 };

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
    focusMeetings,
    prospeccaoAvailableRow,
    decisionMakerRow
  ] = (await runQueriesLimited([
    () => get<{ count: string }>(`SELECT COUNT(*)::text AS count FROM clients c WHERE ${clientFilter}`, params),
    () =>
      get<{ count: string }>(
        `
        SELECT COUNT(DISTINCT c.id)::text AS count
        FROM clients c
        JOIN contacts ct ON ct.client_id = c.id AND ct.verification_status = 'confirmed'
        WHERE ${clientFilter}
      `,
        params
      ),
    () =>
      get<{ count: string }>(
        `
        SELECT COUNT(*)::text AS count FROM clients c
        WHERE ${clientFilter}
          AND NOT EXISTS (SELECT 1 FROM approaches a WHERE a.client_id = c.id)
      `,
        params
      ),
    () =>
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
    () =>
      get<{ count: string }>(
        `
        SELECT COUNT(DISTINCT a.client_id)::text AS count
        FROM approaches a
        JOIN clients c ON c.id = a.client_id
        WHERE ${approachFilter}
      `,
        params
      ),
    () =>
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
    () =>
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
    () =>
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
    () =>
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
    () =>
      all<{ bucket_key: string; channel: string; count: string }>(
        `
        SELECT
          CASE
            WHEN @useMonthBuckets = 1 THEN to_char(a.occurred_at AT TIME ZONE 'America/Sao_Paulo', 'MM/YYYY')
            ELSE to_char(a.occurred_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')
          END AS bucket_key,
          COALESCE(a.channel, 'call') AS channel,
          COUNT(*)::text AS count
        FROM approaches a
        JOIN clients c ON c.id = a.client_id
        WHERE ${approachFilter}
        GROUP BY 1, 2
      `,
        timelineParams
      ),
    () =>
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
    () => all<{ bdr_name: string; approaches: string; meetings: string; clients: string }>(bdrActivitySql, params),
    () =>
      get<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM meetings m WHERE ${meetingFilter} AND m.status IN ('scheduled', 'confirmed')`,
        params
      ),
    () =>
      get<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM meetings m WHERE ${meetingFilter} AND m.status = 'confirmed'`,
        params
      ),
    () =>
      get<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM meetings m WHERE ${meetingFilter} AND m.status = 'held'`,
        params
      ),
    () =>
      get<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM meetings m WHERE ${meetingFilter} AND m.status = 'no_show'`,
        params
      ),
    () =>
      all<{ lead_qualification: string; count: string }>(
        `
        SELECT c.lead_qualification, COUNT(*)::text AS count
        FROM clients c
        WHERE ${clientFilter}
        GROUP BY c.lead_qualification
      `,
        params
      ).catch(() => [] as Array<{ lead_qualification: string; count: string }>),
    () =>
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
    () =>
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
    () =>
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
    () =>
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
    () =>
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
          f.scheduled_at::text AS scheduled_at, f.kind
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
    () =>
      all<{
        id: number;
        client_id: number;
        title: string;
        client_name: string;
        starts_at: string;
      }>(
        `
        SELECT m.id, m.client_id, m.title, m.starts_at::text AS starts_at,
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
      ),
    () =>
      get<{ count: string }>(
        `
        SELECT COUNT(*)::text AS count FROM clients c
        WHERE c.in_prospeccao_queue = true AND ${clientFilter}
      `,
        params
      ),
    () =>
      get<{ count: string }>(
        `
        SELECT COUNT(*)::text AS count
        FROM approaches a
        JOIN clients c ON c.id = a.client_id
        WHERE ${approachFilter} AND a.spoke_with_decision_maker = true
      `,
        params
      )
  ])) as [
    { count: string } | undefined,
    { count: string } | undefined,
    { count: string } | undefined,
    Array<{ bdr_user_id: number | null; bdr_name: string | null; count: string }>,
    { count: string } | undefined,
    Array<{ channel: string; count: string }>,
    Array<{ result_name: string; count: string }>,
    { count: string } | undefined,
    Array<{ user_name: string; count: string }>,
    Array<{ bucket_key: string; channel: string; count: string }>,
    { count: string } | undefined,
    Array<{ bdr_name: string; approaches: string; meetings: string; clients: string }>,
    { count: string } | undefined,
    { count: string } | undefined,
    { count: string } | undefined,
    { count: string } | undefined,
    Array<{ lead_qualification: string; count: string }>,
    { count: string } | undefined,
    { count: string } | undefined,
    { count: string } | undefined,
    { count: string } | undefined,
    Array<{ id: number; client_id: number; client_name: string; scheduled_at: string; kind: string }>,
    Array<{ id: number; client_id: number; title: string; client_name: string; starts_at: string }>,
    { count: string } | undefined,
    { count: string } | undefined
  ];

  const seriesMap = new Map<string, number>();
  const channelSeries = new Map<string, Map<string, number>>();
  for (const row of approachRows) {
    const key = row.bucket_key;
    const n = Number(row.count);
    seriesMap.set(key, (seriesMap.get(key) ?? 0) + n);
    const ch = row.channel || "call";
    if (!channelSeries.has(ch)) channelSeries.set(ch, new Map());
    const bucket = channelSeries.get(ch)!;
    bucket.set(key, (bucket.get(key) ?? 0) + n);
  }
  const approaches_series = [...seriesMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, count]) => ({ label, count }));

  let timelineLabels = [...new Set([...seriesMap.keys()])].sort((a, b) => a.localeCompare(b));
  if (period === "week") {
    timelineLabels = spCurrentWeekDayLabels();
  }
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
      at: timestampIso(f.scheduled_at),
      overdue: timestampIso(f.scheduled_at) < todayStart
    })),
    ...focusMeetings.map((m) => ({
      type: "meeting" as const,
      id: m.id,
      client_id: m.client_id,
      label: "Reunião",
      client_name: m.client_name,
      at: timestampIso(m.starts_at),
      overdue: false
    }))
  ]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, 6);

  const meetingsScheduledN = Number(meetingsScheduled?.count ?? 0);
  const meetingsTodayN = Number(meetingsTodayRow?.count ?? 0);
  const decisionMakerN = Number(decisionMakerRow?.count ?? 0);

  const whatsapp_report = await loadWhatsAppReport(
    approachFilter,
    meetingFilter,
    params,
    period,
    meetingsScheduledN,
    meetingsTodayN,
    decisionMakerN
  );

  const products_breakdown = productId
    ? []
    : await loadProductsBreakdown(clientFilter, approachFilter, params);

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
    decision_maker_contacts: Number(decisionMakerRow?.count ?? 0),
    clients_available_for_contact: Number(prospeccaoAvailableRow?.count ?? 0),
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
    activity_metrics_available: approachesTotal > 0,
    whatsapp_report,
    products_breakdown
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
