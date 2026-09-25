import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { listLossReasons, upsertLossReason } from "@/lib/opportunity-loss-reasons";
import { z } from "zod";

const schema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1),
  status: z.enum(["active", "inactive"]).optional()
});

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  return Response.json({ items: await listLossReasons(false) });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const id = await upsertLossReason(parsed.data);
  return Response.json({ id });
}
