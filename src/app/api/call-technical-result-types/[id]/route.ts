import { requireAdminApi } from "@/lib/admin";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { nowIso, run } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  display_name: z.string().trim().min(1).max(120).optional(),
  provider_rules: z.array(z.record(z.string(), z.unknown())).optional(),
  sort_order: z.number().int().optional(),
  status: z.enum(["active", "inactive"]).optional()
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;

  const { id } = await params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  await run(
    `
      UPDATE call_technical_result_types SET
        display_name = COALESCE(@displayName, display_name),
        provider_rules = COALESCE(@rules::jsonb, provider_rules),
        sort_order = COALESCE(@sortOrder, sort_order),
        status = COALESCE(@status, status),
        updated_at = @now
      WHERE id = @id
    `,
    {
      id: Number(id),
      displayName: parsed.data.display_name ?? null,
      rules: parsed.data.provider_rules ? JSON.stringify(parsed.data.provider_rules) : null,
      sortOrder: parsed.data.sort_order ?? null,
      status: parsed.data.status ?? null,
      now: nowIso()
    }
  );
  return Response.json({ ok: true });
}
