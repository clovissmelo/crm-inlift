import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { nowIso, run } from "@/lib/db";
import { catalogItemSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const body = await request.json();
  const parsed = catalogItemSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  await run(
    `
      UPDATE approach_result_types SET
        name = COALESCE(@name, name),
        status = COALESCE(@status, status),
        suggest_follow_up = COALESCE(@suggestFollowUp, suggest_follow_up),
        updated_at = @now
      WHERE id = @id
    `,
    {
      id: Number(id),
      name: parsed.data.name ?? null,
      status: parsed.data.status ?? null,
      suggestFollowUp: parsed.data.suggest_follow_up ?? null,
      now: nowIso()
    }
  );
  return Response.json({ ok: true });
}
