import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { closeSupersededOpenOpportunities, createOpportunity } from "@/lib/opportunity-pipeline";
import { createProductOpportunityWithEnrollment } from "@/lib/opportunity-prospection-enroll";
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
  const id =
    data.return_to_prospection !== false
      ? await createProductOpportunityWithEnrollment({
          client_id: data.client_id,
          product_id: data.product_id,
          title: data.title ?? "",
          origin_bdr_user_id: data.origin_bdr_user_id,
          owner_user_id: data.owner_user_id,
          created_by_user_id: user.id,
          enrollment: "prospection"
        })
      : await (async () => {
          await closeSupersededOpenOpportunities(data.client_id, data.product_id, user.id);
          return createOpportunity({
            ...data,
            title: data.title ?? "",
            created_by_user_id: user.id
          });
        })();

  return Response.json({ id }, { status: 201 });
}
