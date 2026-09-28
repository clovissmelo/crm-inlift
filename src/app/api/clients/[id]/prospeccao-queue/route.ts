import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { enrollClientInProspeccaoQueue } from "@/lib/prospeccao-return";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  product_id: z.number().int().positive(),
  bdr_user_id: z.number().int().positive()
});

export async function POST(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const clientId = Number(id);
  if (!Number.isFinite(clientId)) {
    return Response.json({ error: "Cliente inválido" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  try {
    await enrollClientInProspeccaoQueue(clientId, user.id, parsed.data.product_id, parsed.data.bdr_user_id);
    return Response.json({ in_prospeccao_queue: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro ao atualizar prospecção" }, { status: 400 });
  }
}
