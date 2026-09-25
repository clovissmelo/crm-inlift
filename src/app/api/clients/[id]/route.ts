import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { getClientDetail, updateClient } from "@/lib/clients";
import { clientSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const detail = await getClientDetail(Number(id));
  if (!detail) return Response.json({ error: "Não encontrado" }, { status: 404 });
  return Response.json(detail);
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const clientId = Number(id);
  const body = await request.json();
  const parsed = clientSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  try {
    await updateClient(clientId, parsed.data);
    const detail = await getClientDetail(clientId);
    return Response.json(detail);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro ao salvar" }, { status: 400 });
  }
}
