import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { queryProspeccaoQueue } from "@/lib/prospeccao-query";
import type { ProspeccaoPrioridadeFilter } from "@/lib/prospeccao-priority";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();

  const url = new URL(request.url);
  const prioridadeParam = url.searchParams.get("prioridade") ?? "";
  const prioridade = (["reagendar", "retorno", "acompanhamento", "primeiro_contato"] as const).includes(
    prioridadeParam as ProspeccaoPrioridadeFilter
  )
    ? (prioridadeParam as ProspeccaoPrioridadeFilter)
    : undefined;

  const result = await queryProspeccaoQueue({
    city: url.searchParams.get("city") ?? undefined,
    uf: url.searchParams.get("uf") ?? undefined,
    segment: url.searchParams.get("segment") ?? undefined,
    product_id: url.searchParams.get("product_id") ? Number(url.searchParams.get("product_id")) : undefined,
    company_id: url.searchParams.get("company_id") ? Number(url.searchParams.get("company_id")) : undefined,
    bdr_user_id: url.searchParams.get("bdr_user_id") ? Number(url.searchParams.get("bdr_user_id")) : undefined,
    phone_availability: (url.searchParams.get("phone_availability") ?? "") as "" | "mobile" | "landline" | "none",
    prioridade,
    search: url.searchParams.get("search") ?? undefined,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 50,
    offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0
  });

  return Response.json(result);
}
