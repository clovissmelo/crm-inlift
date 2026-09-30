import { requireAdminApi } from "@/lib/admin";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { nowIso, run } from "@/lib/db";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().optional().nullable(),
  sort_order: z.number().int().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  requires_conversation: z.boolean().optional()
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  await run(
    `
      UPDATE contact_outcome_types SET
        name = COALESCE(@name, name),
        description = COALESCE(@description, description),
        sort_order = COALESCE(@sortOrder, sort_order),
        status = COALESCE(@status, status),
        requires_conversation = COALESCE(@requiresConversation, requires_conversation),
        updated_at = @now
      WHERE id = @id
    `,
    {
      id: Number(id),
      name: parsed.data.name ?? null,
      description: parsed.data.description ?? null,
      sortOrder: parsed.data.sort_order ?? null,
      status: parsed.data.status ?? null,
      requiresConversation: parsed.data.requires_conversation ?? null,
      now: nowIso()
    }
  );
  return Response.json({ ok: true });
}
