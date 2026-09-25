import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { createOpportunity, findOpenOpportunitiesForProduct } from "@/lib/opportunity-pipeline";
import { opportunityCreateSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const body = await request.json();
  const parsed = opportunityCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const data = parsed.data;
  const existing = await findOpenOpportunitiesForProduct(data.client_id, data.product_id);
  if (existing.length && !data.force_create) {
    return Response.json(
      {
        error: "duplicate_open",
        message: "Já existe oportunidade aberta para este cliente e produto.",
        existing
      },
      { status: 409 }
    );
  }
  const id = await createOpportunity({
    ...data,
    title: data.title ?? "",
    created_by_user_id: user.id
  });
  return Response.json({ id }, { status: 201 });
}
