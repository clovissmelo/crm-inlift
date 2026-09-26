import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { all, nowIso, run } from "@/lib/db";
import { messageScriptSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const productId = url.searchParams.get("product_id");
  const allStatuses = url.searchParams.get("all") === "1";
  const where = allStatuses ? ["1=1"] : ["status = 'active'"];
  const params: Record<string, string | number> = {};
  if (type === "call" || type === "whatsapp" || type === "email") {
    where.push("script_type = @type");
    params.type = type;
  }
  if (productId) {
    where.push("(product_id = @productId OR product_id IS NULL)");
    params.productId = Number(productId);
  }
  const items = await all(
    `SELECT * FROM message_scripts WHERE ${where.join(" AND ")} ORDER BY title`,
    params
  );
  return Response.json({ items });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const parsed = messageScriptSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const data = parsed.data;
  const result = await run(
    `
      INSERT INTO message_scripts (title, product_id, script_type, body, status, created_at, updated_at)
      VALUES (@title, @productId, @scriptType, @body, @status, @now, @now)
    `,
    {
      title: data.title,
      productId: data.product_id ?? null,
      scriptType: data.script_type,
      body: data.body,
      status: data.status,
      now: nowIso()
    }
  );
  return Response.json({ id: result.lastInsertRowid }, { status: 201 });
}
