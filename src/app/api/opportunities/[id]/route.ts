import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { getOpportunityDetail, updateOpportunityFields } from "@/lib/opportunity-pipeline";
import { opportunityUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const detail = await getOpportunityDetail(Number(id));
  if (!detail) return Response.json({ error: "Não encontrado" }, { status: 404 });
  return Response.json(detail);
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const parsed = opportunityUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  try {
    await updateOpportunityFields(Number(id), user.id, parsed.data);
    const detail = await getOpportunityDetail(Number(id));
    return Response.json(detail);
  } catch (e) {
    if (e instanceof Error && e.message === "CONFLICT_VERSION") {
      return Response.json({ error: "Outro usuário alterou esta oportunidade. Recarregue e tente novamente." }, { status: 409 });
    }
    return Response.json({ error: e instanceof Error ? e.message : "Erro ao salvar" }, { status: 400 });
  }
}
