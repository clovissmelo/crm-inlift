import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { findOpenOpportunitiesForProduct } from "@/lib/opportunity-pipeline";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const url = new URL(request.url);
  const clientId = Number(url.searchParams.get("client_id"));
  const productId = Number(url.searchParams.get("product_id"));
  if (!clientId || !productId) {
    return Response.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }
  const existing = await findOpenOpportunitiesForProduct(clientId, productId);
  return Response.json({ existing });
}
