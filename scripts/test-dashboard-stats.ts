import { initDb, get, all } from "../src/lib/db";
import { periodToRange, type DashboardPeriod } from "../src/lib/datetime";
import { getOpportunityDashboardMetrics } from "../src/lib/opportunity-pipeline";

async function main() {
  await initDb();
  const period: DashboardPeriod = "7d";
  const range = periodToRange(period);
  const params: Record<string, string | number> = {};
  const clientFilter = "1=1";
  let approachFilter = "1=1";
  if (range.from) {
    approachFilter += " AND a.occurred_at >= @from AND a.occurred_at <= @to";
    params.from = range.from;
    params.to = range.to!;
  }

  const steps: Array<[string, () => Promise<unknown>]> = [
    ["total clients", () => get(`SELECT COUNT(*)::text AS count FROM clients c WHERE ${clientFilter}`, params)],
    [
      "verified",
      () =>
        get(
          `SELECT COUNT(DISTINCT c.id)::text AS count FROM clients c JOIN contacts ct ON ct.client_id = c.id AND ct.verification_status = 'confirmed' WHERE ${clientFilter}`,
          params
        )
    ],
    [
      "bdr activity",
      () =>
        all(
          `SELECT u.name AS bdr_name FROM users u WHERE (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role = 'bdr') OR EXISTS (SELECT 1 FROM approaches a2 WHERE a2.user_id = u.id)) LIMIT 1`,
          params
        )
    ],
    ["opp metrics", () => getOpportunityDashboardMetrics({ period })],
    [
      "clients reached",
      () =>
        get(
          `SELECT COUNT(DISTINCT a.client_id)::text AS count FROM approaches a JOIN clients c ON c.id = a.client_id JOIN approach_result_types rt ON rt.id = a.result_type_id WHERE ${approachFilter} AND rt.slug IN ('falou_responsavel', 'falou_outra_pessoa', 'demonstrou_interesse', 'pediu_retorno', 'reuniao_agendada')`,
          params
        )
    ],
    [
      "qualification",
      () =>
        all(
          `SELECT c.lead_qualification, COUNT(*)::text AS count FROM clients c WHERE ${clientFilter} GROUP BY c.lead_qualification`,
          params
        )
    ]
  ];

  for (const [name, fn] of steps) {
    try {
      await fn();
      console.log("OK", name);
    } catch (e) {
      console.error("FAIL", name, e);
      process.exit(1);
    }
  }
  console.log("all ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
