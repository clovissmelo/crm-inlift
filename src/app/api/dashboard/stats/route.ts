import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { dashboardStatsFromSearchParams, loadDashboardStats } from "@/lib/dashboard-stats";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();

  try {
    const url = new URL(request.url);
    const stats = await loadDashboardStats(dashboardStatsFromSearchParams(url.searchParams));
    return Response.json(stats);
  } catch (e) {
    console.error("[api/dashboard/stats]", e);
    const message = e instanceof Error ? e.message : "Erro ao carregar indicadores";
    return Response.json({ error: message }, { status: 500 });
  }
}
