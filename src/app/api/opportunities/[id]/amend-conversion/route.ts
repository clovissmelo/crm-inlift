import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { amendConversion, getOpportunityDetail } from "@/lib/opportunity-pipeline";
import { z } from "zod";

const schema = z.object({
  reason: z.string().trim().min(1),
  closer_user_id: z.number().int().positive(),
  closed_at: z.string().min(1),
  deal_value: z.number().optional().nullable(),
  deal_value_tbd: z.boolean().optional()
});

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  try {
    await amendConversion({
      opportunity_id: Number(id),
      user_id: user.id,
      ...parsed.data
    });
    const detail = await getOpportunityDetail(Number(id));
    return Response.json(detail);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 400 });
  }
}
