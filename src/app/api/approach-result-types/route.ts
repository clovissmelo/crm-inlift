import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { all, nowIso, run } from "@/lib/db";
import { catalogItemSchema } from "@/lib/validators";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const items = await all(
    "SELECT * FROM approach_result_types ORDER BY sort_order, name"
  );
  return Response.json({ items });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const body = await request.json();
  const parsed = catalogItemSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const slug = body.slug as string | undefined;
  if (!slug?.trim()) return Response.json({ error: "Informe um identificador (slug)" }, { status: 400 });
  try {
    const result = await run(
      `
        INSERT INTO approach_result_types (slug, name, status, suggest_follow_up, lead_qualification, created_at, updated_at)
        VALUES (@slug, @name, @status, @suggestFollowUp, @leadQualification, @now, @now)
      `,
      {
        slug: slug.trim(),
        name: parsed.data.name,
        status: parsed.data.status ?? "active",
        suggestFollowUp: parsed.data.suggest_follow_up ?? false,
        leadQualification: parsed.data.lead_qualification ?? null,
        now: nowIso()
      }
    );
    return Response.json({ id: result.lastInsertRowid }, { status: 201 });
  } catch {
    return Response.json({ error: "Não foi possível salvar (slug duplicado?)" }, { status: 400 });
  }
}
