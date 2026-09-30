import { requireAdminApi } from "@/lib/admin";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { all, nowIso, run } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  slug: z.string().trim().min(1).max(80),
  display_name: z.string().trim().min(1).max(120),
  provider_rules: z.array(z.record(z.string(), z.unknown())).default([]),
  sort_order: z.number().int().optional(),
  status: z.enum(["active", "inactive"]).optional()
});

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const items = await all("SELECT * FROM call_technical_result_types ORDER BY sort_order, id");
  return Response.json({ items });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const now = nowIso();
  const result = await run(
    `
      INSERT INTO call_technical_result_types (slug, display_name, provider_rules, sort_order, status, created_at, updated_at)
      VALUES (@slug, @displayName, @rules::jsonb, @sortOrder, @status, @now, @now)
    `,
    {
      slug: parsed.data.slug,
      displayName: parsed.data.display_name,
      rules: JSON.stringify(parsed.data.provider_rules),
      sortOrder: parsed.data.sort_order ?? 0,
      status: parsed.data.status ?? "active",
      now
    }
  );
  return Response.json({ id: result.lastInsertRowid }, { status: 201 });
}
