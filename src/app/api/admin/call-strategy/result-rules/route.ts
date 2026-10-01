import { requireAdminApi } from "@/lib/admin";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { listCallStrategyResultRules } from "@/lib/call-strategy/settings";
import { run } from "@/lib/db";
import { z } from "zod";

const patchSchema = z.object({
  id: z.number().int(),
  consumes_attempt: z.boolean().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  sort_order: z.number().int().optional()
});

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;
  const items = await listCallStrategyResultRules();
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
  const { id, ...rest } = parsed.data;
  if (rest.consumes_attempt !== undefined) {
    await run("UPDATE call_strategy_result_rules SET consumes_attempt = @v WHERE id = @id", {
      id,
      v: rest.consumes_attempt
    });
  }
  if (rest.status !== undefined) {
    await run("UPDATE call_strategy_result_rules SET status = @v WHERE id = @id", { id, v: rest.status });
  }
  if (rest.sort_order !== undefined) {
    await run("UPDATE call_strategy_result_rules SET sort_order = @v WHERE id = @id", { id, v: rest.sort_order });
  }
  return Response.json({ items: await listCallStrategyResultRules() });
}
