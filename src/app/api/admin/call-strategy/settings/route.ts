import { requireAdminApi } from "@/lib/admin";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { getCallStrategySettings, updateCallStrategySettings } from "@/lib/call-strategy/settings";
import { z } from "zod";

const patchSchema = z.object({
  max_no_contact_attempts: z.number().int().min(1).max(20).optional(),
  max_no_answer_attempts: z.number().int().min(1).max(20).optional(),
  max_invalid_attempts: z.number().int().min(1).max(20).optional(),
  max_wrong_number_attempts: z.number().int().min(1).max(20).optional(),
  min_interval_minutes: z.number().int().min(0).max(60 * 24 * 7).optional(),
  round_interval_hours: z.number().int().min(0).max(24 * 30).optional()
});

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;
  const settings = await getCallStrategySettings();
  return Response.json({ settings });
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
  await updateCallStrategySettings(parsed.data);
  return Response.json({ settings: await getCallStrategySettings() });
}
