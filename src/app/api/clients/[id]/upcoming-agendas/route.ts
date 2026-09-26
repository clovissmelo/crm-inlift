import { listUpcomingClientAgendas } from "@/lib/client-agendas";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { get } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const clientId = Number(id);
  const client = await get<{ id: number }>("SELECT id FROM clients WHERE id = @id", { id: clientId });
  if (!client) return Response.json({ error: "Não encontrado" }, { status: 404 });
  const items = await listUpcomingClientAgendas(clientId);
  return Response.json({ items });
}
