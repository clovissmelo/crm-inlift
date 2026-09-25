import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { getFunnelStats } from "@/lib/funnel-stats";
import type { DashboardPeriod } from "@/lib/datetime";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const url = new URL(request.url);
  const stats = await getFunnelStats({
    period: (url.searchParams.get("period") ?? "all") as DashboardPeriod,
    product_id: url.searchParams.get("product_id") ? Number(url.searchParams.get("product_id")) : undefined,
    bdr_user_id: url.searchParams.get("bdr_user_id") ? Number(url.searchParams.get("bdr_user_id")) : undefined
  });
  return Response.json(stats);
}
