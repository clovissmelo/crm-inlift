import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { listAttendanceRules } from "@/lib/attendance/rules-repo";
import { getCallStrategySettings } from "@/lib/call-strategy/settings";

/** Regras ativas para registro BDR (somente leitura). */
export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const [items, settings] = await Promise.all([listAttendanceRules(true), getCallStrategySettings()]);
  return Response.json({
    max_no_contact_attempts: settings.max_no_contact_attempts,
    items: items.map((r) => ({
      id: r.id,
      answered: r.answered,
      name: r.name,
      slug: r.slug,
      operational_action: r.operational_action,
      commercial_result_type_id: r.commercial_result_type_id,
      pipeline_stage_id: r.pipeline_stage_id,
      sort_order: r.sort_order
    }))
  });
}
