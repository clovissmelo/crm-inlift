import { getCallDetailForUser } from "@/lib/api4com/calls";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

/** Redireciona para a gravação somente após checagem de sessão (URL não exposta na listagem). */
export async function GET(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const call = await getCallDetailForUser(Number(id), user.id);
  if (!call?.record_url) {
    return Response.json({ error: "Gravação indisponível" }, { status: 404 });
  }
  return Response.redirect(call.record_url, 302);
}
