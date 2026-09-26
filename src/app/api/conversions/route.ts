import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import type { DashboardPeriod } from "@/lib/datetime";
import { listConvertedDeals } from "@/lib/opportunity-pipeline";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const url = new URL(request.url);
  const closedFrom = url.searchParams.get("closed_from") ?? undefined;
  const closedTo = url.searchParams.get("closed_to") ?? undefined;
  const periodParam = url.searchParams.get("period");
  const filters = {
    closed_from: closedFrom,
    closed_to: closedTo,
    period: !closedFrom && !closedTo && periodParam ? (periodParam as DashboardPeriod) : undefined,
    product_id: url.searchParams.get("product_id") ? Number(url.searchParams.get("product_id")) : undefined,
    company_id: url.searchParams.get("company_id") ? Number(url.searchParams.get("company_id")) : undefined,
    origin_bdr_user_id: url.searchParams.get("origin_bdr_user_id")
      ? Number(url.searchParams.get("origin_bdr_user_id"))
      : undefined,
    closer_user_id: url.searchParams.get("closer_user_id") ? Number(url.searchParams.get("closer_user_id")) : undefined
  };
  const items = await listConvertedDeals(filters);
  if (url.searchParams.get("format") === "csv") {
    const header =
      "oportunidade_id,titulo,cliente,empresa,produto,bdr_origem,closer,data_fechamento,valor,valor_a_definir,registrado_em\n";
    const rows = (items as Record<string, unknown>[]).map((r) =>
      [
        r.opportunity_id,
        `"${String(r.title).replace(/"/g, '""')}"`,
        `"${String(r.client_name).replace(/"/g, '""')}"`,
        `"${String(r.company_name ?? "").replace(/"/g, '""')}"`,
        `"${String(r.product_name).replace(/"/g, '""')}"`,
        `"${String(r.origin_bdr_name ?? "").replace(/"/g, '""')}"`,
        `"${String(r.closer_name).replace(/"/g, '""')}"`,
        r.closed_at,
        r.deal_value ?? "",
        r.deal_value_tbd ? "sim" : "nao",
        r.recorded_at
      ].join(",")
    );
    return new Response(header + rows.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="negocios-convertidos.csv"'
      }
    });
  }
  return Response.json({ items });
}
