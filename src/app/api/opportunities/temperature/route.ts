import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { setOpportunityTemperature } from "@/lib/opportunities";
import { setOpportunityTemperatureById } from "@/lib/opportunity-pipeline";
import { z } from "zod";

const schema = z.object({
  opportunity_id: z.number().int().positive().optional(),
  client_id: z.number().int().positive().optional(),
  product_id: z.number().int().positive().optional(),
  temperature: z.enum(["cold", "warm", "hot"]).nullable()
});

export async function PATCH(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  if (parsed.data.opportunity_id) {
    await setOpportunityTemperatureById(parsed.data.opportunity_id, user.id, parsed.data.temperature);
  } else if (parsed.data.client_id && parsed.data.product_id) {
    await setOpportunityTemperature(parsed.data.client_id, parsed.data.product_id, user.id, parsed.data.temperature);
  } else {
    return Response.json({ error: "Informe opportunity_id ou client_id + product_id" }, { status: 400 });
  }
  return Response.json({ ok: true });
}
