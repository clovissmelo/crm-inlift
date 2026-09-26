import { deleteBlockedMessage, requireAdminApi } from "@/lib/admin";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { get, nowIso, run } from "@/lib/db";
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
        lead_qualification = CASE WHEN @leadQualificationSet THEN @leadQualification ELSE lead_qualification END,
        collect_notes = COALESCE(@collectNotes, collect_notes),
        require_schedule_return = COALESCE(@requireScheduleReturn, require_schedule_return),
        updated_at = @now
      WHERE id = @id
    `,
    {
      id: Number(id),
      name: parsed.data.name ?? null,
      status: parsed.data.status ?? null,
      suggestFollowUp: parsed.data.suggest_follow_up ?? null,
      leadQualificationSet: parsed.data.lead_qualification !== undefined,
      leadQualification: parsed.data.lead_qualification ?? null,
      collectNotes: parsed.data.collect_notes ?? null,
      requireScheduleReturn: parsed.data.require_schedule_return ?? null,
      now: nowIso()
    }
  );
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;
  const { id } = await params;
  const typeId = Number(id);
  const row = await get<{ id: number }>("SELECT id FROM approach_result_types WHERE id = @id", { id: typeId });
  if (!row) return Response.json({ error: "Não encontrado" }, { status: 404 });
  try {
    await run("DELETE FROM approach_result_types WHERE id = @id", { id: typeId });
  } catch (err) {
    return Response.json({ error: deleteBlockedMessage(err) }, { status: 409 });
  }
  return Response.json({ ok: true });
}
