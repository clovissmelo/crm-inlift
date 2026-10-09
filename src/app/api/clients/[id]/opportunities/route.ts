import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { getClientDetail } from "@/lib/clients";
import { listClientOpportunities } from "@/lib/opportunities";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const clientId = Number(id);
  const detail = await getClientDetail(clientId);
  if (!detail) return Response.json({ error: "Não encontrado" }, { status: 404 });
  const opportunities = await listClientOpportunities(clientId);
  return Response.json({
    opportunities,
    products: detail.products,
    client: {
      id: clientId,
      bdr_user_id: detail.client.bdr_user_id as number | null,
      trade_name: detail.client.trade_name as string | null,
      legal_name: detail.client.legal_name as string | null
    }
  });
}
