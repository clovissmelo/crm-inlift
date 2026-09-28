import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { addClientProductLink } from "@/lib/clients";
import { closeSupersededOpenOpportunities, createOpportunity } from "@/lib/opportunity-pipeline";
import { get } from "@/lib/db";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  product_id: z.number().int().positive(),
  create_opportunity: z.boolean().optional()
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
    await addClientProductLink(clientId, parsed.data.product_id);
    let opportunity_id: number | undefined;
    if (parsed.data.create_opportunity) {
      const client = await get<{ bdr_user_id: number | null }>("SELECT bdr_user_id FROM clients WHERE id = @id", {
        id: clientId
      });
      await closeSupersededOpenOpportunities(clientId, parsed.data.product_id, user.id);
      opportunity_id = await createOpportunity({
        client_id: clientId,
        product_id: parsed.data.product_id,
        title: "",
        origin_bdr_user_id: client?.bdr_user_id,
        created_by_user_id: user.id
      });
    }
    return Response.json({ ok: true, opportunity_id });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro ao vincular produto" }, { status: 400 });
  }
}
