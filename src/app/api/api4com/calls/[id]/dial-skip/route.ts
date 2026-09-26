import { getCallById, recordDialSkip } from "@/lib/api4com/calls";
import { resolveDialSessionRootId } from "@/lib/api4com/dial-queue";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  contact_id: z.number().int().positive().optional().nullable(),
  phone: z.string().trim().min(8)
});

export async function POST(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const callId = Number(id);
  const row = await getCallById(callId);
  if (!row || row.user_id !== user.id) {
    return Response.json({ error: "Chamada não encontrada" }, { status: 404 });
  }
  if (!row.client_id) {
    return Response.json({ error: "Chamada sem cliente vinculado" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Dados inválidos" }, { status: 400 });
  }

  try {
    const sessionRootId = await resolveDialSessionRootId(callId);
    await recordDialSkip({
      sessionRootId,
      userId: user.id,
      clientId: row.client_id,
      contactId: parsed.data.contact_id,
      phone: parsed.data.phone
    });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 400 });
  }
}
