import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { queryAllMatchingClientIds } from "@/lib/clients-query";
import {
  clientFiltersFromOrganizacaoParams,
  organizacaoFiltersToRecord
} from "@/lib/organizacao-leads-filters";
import { closeSupersededOpenOpportunities, createOpportunity } from "@/lib/opportunity-pipeline";
import { get, nowIso, run } from "@/lib/db";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();

  const body = (await request.json()) as {
    product_id: number;
    client_ids?: number[];
    select_all?: boolean;
    filters?: Record<string, string>;
  };

  if (!body.product_id || !Number.isFinite(body.product_id)) {
    return Response.json({ error: "Informe o produto" }, { status: 400 });
  }

  const product = await get<{ id: number; name: string }>("SELECT id, name FROM products WHERE id = @id", {
    id: body.product_id
  });
  if (!product) return Response.json({ error: "Produto não encontrado" }, { status: 404 });

  let clientIds = body.client_ids ?? [];
  if (body.select_all && body.filters) {
    const parsed = clientFiltersFromOrganizacaoParams({
      ...organizacaoFiltersToRecord(body.filters),
      limit: "500",
      offset: "0"
    });
    clientIds = await queryAllMatchingClientIds(parsed);
  }

  clientIds = [...new Set(clientIds.filter((id) => Number.isInteger(id)))];
  if (!clientIds.length) {
    return Response.json({ error: "Nenhum cliente selecionado" }, { status: 400 });
  }

  let linked = 0;
  let opportunities = 0;
  const now = nowIso();

  for (const clientId of clientIds) {
    await run(
      `
        INSERT INTO client_products (client_id, product_id)
        VALUES (@clientId, @productId)
        ON CONFLICT (client_id, product_id) DO NOTHING
      `,
      { clientId, productId: body.product_id }
    );
    linked += 1;

    const client = await get<{ bdr_user_id: number | null }>("SELECT bdr_user_id FROM clients WHERE id = @id", {
      id: clientId
    });

    await closeSupersededOpenOpportunities(clientId, body.product_id, user.id);
    await createOpportunity({
      client_id: clientId,
      product_id: body.product_id,
      title: "",
      origin_bdr_user_id: client?.bdr_user_id,
      created_by_user_id: user.id
    });
    opportunities += 1;

    await run("UPDATE clients SET updated_at = @now WHERE id = @id", { id: clientId, now });
  }

  return Response.json({
    product_id: body.product_id,
    product_name: product.name,
    clients: clientIds.length,
    products_linked: linked,
    opportunities_created: opportunities
  });
}
