import { linkCallToApproach } from "@/lib/api4com/calls";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  approach_id: z.number().int().positive()
});

export async function POST(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Dados inválidos" }, { status: 400 });
  }
  try {
    await linkCallToApproach(Number(id), user.id, parsed.data.approach_id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 400 });
  }
}
