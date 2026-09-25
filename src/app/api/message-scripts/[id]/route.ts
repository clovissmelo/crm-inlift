import { deleteBlockedMessage, requireAdminApi } from "@/lib/admin";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { get, nowIso, run } from "@/lib/db";
import { messageScriptSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const { id } = await params;
  const parsed = messageScriptSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const data = parsed.data;
  await run(
    `
      UPDATE message_scripts SET title = @title, product_id = @productId, script_type = @scriptType,
        body = @body, status = @status, updated_at = @now
      WHERE id = @id
    `,
    {
      id: Number(id),
      title: data.title,
      productId: data.product_id ?? null,
      scriptType: data.script_type,
      body: data.body,
      status: data.status,
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
  const scriptId = Number(id);
  const row = await get<{ id: number }>("SELECT id FROM message_scripts WHERE id = @id", { id: scriptId });
  if (!row) return Response.json({ error: "Não encontrado" }, { status: 404 });
  try {
    await run("DELETE FROM message_scripts WHERE id = @id", { id: scriptId });
  } catch (err) {
    return Response.json({ error: deleteBlockedMessage(err) }, { status: 409 });
  }
  return Response.json({ ok: true });
}
