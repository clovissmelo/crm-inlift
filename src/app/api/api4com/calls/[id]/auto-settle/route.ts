import { autoSettleApi4comCall } from "@/lib/api4com/auto-settle-call";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const callId = Number((await params).id);
  if (!Number.isFinite(callId)) {
    return Response.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    const result = await autoSettleApi4comCall(callId, user.id);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 400 });
  }
}
