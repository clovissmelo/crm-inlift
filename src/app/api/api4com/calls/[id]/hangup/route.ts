import { hangUpCallForUser } from "@/lib/api4com/calls";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  if (!user.roles.includes("bdr") && !user.roles.includes("admin")) {
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  }
  const { id } = await params;
  const callId = Number(id);
  if (!Number.isFinite(callId)) {
    return Response.json({ error: "ID inválido." }, { status: 400 });
  }
  try {
    await hangUpCallForUser(callId, user.id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro ao desligar" }, { status: 400 });
  }
}
