import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { getOpportunityDetail, moveOpportunityStage } from "@/lib/opportunity-pipeline";
import { opportunityStageMoveSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const parsed = opportunityStageMoveSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  try {
    await moveOpportunityStage({
      opportunity_id: Number(id),
      user_id: user.id,
      ...parsed.data
    });
    const detail = await getOpportunityDetail(Number(id));
    return Response.json(detail);
  } catch (e) {
    if (e instanceof Error && e.message === "CONFLICT_VERSION") {
      return Response.json({ error: "Conflito de edição simultânea. Recarregue o funil." }, { status: 409 });
    }
    return Response.json({ error: e instanceof Error ? e.message : "Erro ao mover etapa" }, { status: 400 });
  }
}
