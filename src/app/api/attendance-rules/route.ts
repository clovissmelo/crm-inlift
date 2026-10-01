import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { listAttendanceRules } from "@/lib/attendance/rules-repo";

/** Regras ativas para registro BDR (somente leitura). */
export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const items = await listAttendanceRules(true);
  return Response.json({
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
