import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import type { ClientFilters } from "@/lib/clients-query";
import { parseLeadQualification } from "@/lib/lead-qualification";
import { countProspeccaoQueueByPriority } from "@/lib/prospeccao-query";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();

  const url = new URL(request.url);
  const temp = url.searchParams.get("temperature");
  const leadQualification =
    temp === "cold" || temp === "warm" || temp === "hot" ? parseLeadQualification(temp) : undefined;

  const filters: ClientFilters = {
    product_id: url.searchParams.get("product_id") ? Number(url.searchParams.get("product_id")) : undefined,
    bdr_user_id: url.searchParams.get("origin_bdr_user_id")
      ? Number(url.searchParams.get("origin_bdr_user_id"))
      : url.searchParams.get("owner_user_id")
        ? Number(url.searchParams.get("owner_user_id"))
        : undefined,
    lead_qualification: leadQualification ?? "",
    city: url.searchParams.get("city") ?? undefined,
    uf: url.searchParams.get("uf") ?? undefined
  };

  const stats = await countProspeccaoQueueByPriority(filters);
  return Response.json(stats);
}
