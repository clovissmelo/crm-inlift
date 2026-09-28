import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { closeSupersededOpenOpportunities, createOpportunity } from "@/lib/opportunity-pipeline";
import { returnClientToProspeccaoQueue } from "@/lib/prospeccao-return";
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
  await closeSupersededOpenOpportunities(data.client_id, data.product_id, user.id);
  const id = await createOpportunity({
    ...data,
    title: data.title ?? "",
    created_by_user_id: user.id
  });

  if (data.return_to_prospection !== false) {
    await returnClientToProspeccaoQueue(data.client_id, user.id, data.product_id);
  }

  return Response.json({ id }, { status: 201 });
}
