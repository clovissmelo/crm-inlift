import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { completeFollowUp, getFollowUpDetail } from "@/lib/follow-ups";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const detail = await getFollowUpDetail(Number(id));
  if (!detail) return Response.json({ error: "Não encontrado" }, { status: 404 });
  return Response.json(detail);
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const body = (await request.json()) as { action?: string; completion_approach_id?: number };
  if (body.action === "complete") {
    await completeFollowUp(Number(id), user.id, body.completion_approach_id);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Ação inválida" }, { status: 400 });
}
