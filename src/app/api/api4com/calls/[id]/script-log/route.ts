import { appendCallScriptLog } from "@/lib/api4com/calls";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  step_id: z.string().min(1),
  step_title: z.string().min(1),
  action: z.enum(["next", "choice", "restart"]),
  choice_label: z.string().optional().nullable(),
  next_step_id: z.string().optional().nullable()
});

export async function POST(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const callId = Number(id);
  if (!Number.isFinite(callId)) {
    return Response.json({ error: "Chamada inválida" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  try {
    const log = await appendCallScriptLog(callId, user.id, parsed.data);
    return Response.json({ log });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro ao registrar roteiro" }, { status: 400 });
  }
}
