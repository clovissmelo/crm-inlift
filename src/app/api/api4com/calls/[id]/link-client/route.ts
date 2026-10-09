import { linkManualCallToClient } from "@/lib/api4com/calls";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { api4comLinkCallClientSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const parsed = api4comLinkCallClientSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  try {
    await linkManualCallToClient({
      callId: Number(id),
      userId: user.id,
      clientId: parsed.data.client_id,
      productId: parsed.data.product_id ?? null,
      contactId: parsed.data.contact_id ?? null
    });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro ao vincular" }, { status: 400 });
  }
}
