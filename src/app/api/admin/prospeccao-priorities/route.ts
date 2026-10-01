import { requireAdminApi } from "@/lib/admin";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { listProspeccaoPriorityTypes } from "@/lib/call-strategy/priorities-config";
import { nowIso, run } from "@/lib/db";
import { z } from "zod";

const patchSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  color: z.string().max(32).optional(),
  sort_order: z.number().int().optional()
});

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;
  const items = await listProspeccaoPriorityTypes();
  return Response.json({ items });
}

export async function PATCH(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const row = await listProspeccaoPriorityTypes().then((rows) => rows.find((r) => r.id === parsed.data.id));
  if (!row) return Response.json({ error: "Prioridade não encontrada" }, { status: 404 });

  await run(
    `
      UPDATE prospeccao_priority_types SET
        name = COALESCE(@name, name),
        description = CASE WHEN @descSet THEN @description ELSE description END,
        color = COALESCE(@color, color),
        sort_order = COALESCE(@sortOrder, sort_order),
        updated_at = @now
      WHERE id = @id
    `,
    {
      id: parsed.data.id,
      name: parsed.data.name ?? null,
      descSet: parsed.data.description !== undefined,
      description: parsed.data.description ?? null,
      color: parsed.data.color ?? null,
      sortOrder: parsed.data.sort_order ?? null,
      now: nowIso()
    }
  );
  return Response.json({ items: await listProspeccaoPriorityTypes() });
}
