import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { queryClients } from "@/lib/clients-query";
import { createClient } from "@/lib/clients";
import { clientSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();

  const url = new URL(request.url);
  const filters = {
    city: url.searchParams.get("city") ?? undefined,
    uf: url.searchParams.get("uf") ?? undefined,
    segment: url.searchParams.get("segment") ?? undefined,
    product_id: url.searchParams.get("product_id") ? Number(url.searchParams.get("product_id")) : undefined,
    bdr_user_id: url.searchParams.get("bdr_user_id") ? Number(url.searchParams.get("bdr_user_id")) : undefined,
    phone_availability: (url.searchParams.get("phone_availability") ?? "") as "" | "mobile" | "landline" | "none",
    without_approach: url.searchParams.get("without_approach") === "1",
    lead_qualification: (url.searchParams.get("lead_qualification") ?? "") as "" | "cold" | "warm" | "hot",
    search: url.searchParams.get("search") ?? undefined,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 50,
    offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0
  };

  const result = await queryClients(filters);
  return Response.json(result);
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const body = await request.json();
  const parsed = clientSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  try {
    const id = await createClient(parsed.data);
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro ao salvar" }, { status: 400 });
  }
}
