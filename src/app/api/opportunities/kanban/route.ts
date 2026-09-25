import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import type { DashboardPeriod } from "@/lib/datetime";
import { getKanbanData } from "@/lib/opportunity-pipeline";
import { listPipelineStages } from "@/lib/pipeline-stages";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const url = new URL(request.url);
  const cards = await getKanbanData({
    product_id: url.searchParams.get("product_id") ? Number(url.searchParams.get("product_id")) : undefined,
    origin_bdr_user_id: url.searchParams.get("origin_bdr_user_id")
      ? Number(url.searchParams.get("origin_bdr_user_id"))
      : undefined,
    owner_user_id: url.searchParams.get("owner_user_id") ? Number(url.searchParams.get("owner_user_id")) : undefined,
    closer_user_id: url.searchParams.get("closer_user_id") ? Number(url.searchParams.get("closer_user_id")) : undefined,
    temperature: url.searchParams.get("temperature") ?? undefined,
    city: url.searchParams.get("city") ?? undefined,
    uf: url.searchParams.get("uf") ?? undefined,
    period: (url.searchParams.get("period") ?? "all") as DashboardPeriod
  });
  const stages = await listPipelineStages(true);
  return Response.json({ stages, cards });
}
