import { requireAdminApi } from "@/lib/admin";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { all, nowIso, run } from "@/lib/db";
import { z } from "zod";

const createSchema = z.object({
  slug: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().optional().nullable(),
  sort_order: z.number().int().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  requires_conversation: z.boolean().optional()
});

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const items = await all(
    "SELECT * FROM contact_outcome_types ORDER BY sort_order, name"
  );
  return Response.json({ items });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const result = await run(
    `
      INSERT INTO contact_outcome_types (slug, name, description, sort_order, status, requires_conversation, created_at, updated_at)
      VALUES (@slug, @name, @description, @sortOrder, @status, @requiresConversation, @now, @now)
    `,
    {
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      sortOrder: parsed.data.sort_order ?? 0,
      status: parsed.data.status ?? "active",
      requiresConversation: parsed.data.requires_conversation ?? false,
      now: nowIso()
    }
  );
  return Response.json({ id: result.lastInsertRowid }, { status: 201 });
}
