import { requireWarmScreenApiUser } from "@/lib/warm-screen/api-auth";
import { canWarmScreenLeadsForBdr } from "@/lib/warm-screen/permissions";
import { queryWarmScreenLeadQueue } from "@/lib/warm-screen/queue";

export async function GET(request: Request) {
  const { user, denied } = await requireWarmScreenApiUser();
  if (denied) return denied;

  const url = new URL(request.url);
  const bdrParam = url.searchParams.get("bdr_user_id");
  const bdrUserId = bdrParam ? Number(bdrParam) : undefined;
  if (bdrUserId && !canWarmScreenLeadsForBdr(user!, bdrUserId)) {
    return Response.json({ error: "Sem permissão para filtrar leads desta BDR." }, { status: 403 });
  }

  const prioridadeParam = url.searchParams.get("prioridade")?.trim();

  const result = await queryWarmScreenLeadQueue({
    product_id: url.searchParams.get("product_id") ? Number(url.searchParams.get("product_id")) : undefined,
    company_id: url.searchParams.get("company_id") ? Number(url.searchParams.get("company_id")) : undefined,
    bdr_user_id: bdrUserId,
    prioridade: prioridadeParam || undefined,
    search: url.searchParams.get("search") ?? undefined,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 50,
    offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0,
    exclude_warm_screen_confirmed: true
  });

  return Response.json(result);
}
