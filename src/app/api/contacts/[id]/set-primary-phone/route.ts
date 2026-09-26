import { setContactAsPrimaryPhone } from "@/lib/contacts";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  try {
    await setContactAsPrimaryPhone(Number(id));
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro ao salvar" }, { status: 400 });
  }
}
