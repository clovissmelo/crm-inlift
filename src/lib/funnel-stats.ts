import { get } from "@/lib/db";
import { periodToRange, type DashboardPeriod } from "@/lib/datetime";

export async function getFunnelStats(options: {
  period: DashboardPeriod;
  product_id?: number;
  bdr_user_id?: number;
}) {
  const range = periodToRange(options.period);
  let approachFilter = "1=1";
  let meetingFilter = "m.status NOT IN ('cancelled')";
  const params: Record<string, string | number> = {};

  if (options.product_id) {
    approachFilter += " AND a.product_id = @productId";
    meetingFilter += " AND m.product_id = @productId";
    params.productId = options.product_id;
  }
  if (options.bdr_user_id) {
    approachFilter += " AND a.user_id = @bdrUserId";
    meetingFilter += " AND m.bdr_user_id = @bdrUserId";
    params.bdrUserId = options.bdr_user_id;
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

  const attempted = await get<{ count: string }>(
    `SELECT COUNT(DISTINCT a.client_id)::text AS count FROM approaches a WHERE ${approachFilter}`,
    params
  );

  const spoken = await get<{ count: string }>(
    `
      SELECT COUNT(DISTINCT a.client_id)::text AS count
      FROM approaches a
      JOIN approach_result_types rt ON rt.id = a.result_type_id
      WHERE ${approachFilter}
        AND rt.slug IN (
          'falou_responsavel', 'falou_outra_pessoa', 'demonstrou_interesse',
          'pediu_retorno', 'reuniao_agendada', 'sem_interesse'
        )
    `,
    params
  );

  const meetingsScheduled = await get<{ count: string }>(
    `SELECT COUNT(DISTINCT m.client_id)::text AS count FROM meetings m WHERE ${meetingFilter}`,
    params
  );

  return {
    unique_clients_attempted: Number(attempted?.count ?? 0),
    unique_clients_spoken: Number(spoken?.count ?? 0),
    unique_clients_meeting_scheduled: Number(meetingsScheduled?.count ?? 0)
  };
}
