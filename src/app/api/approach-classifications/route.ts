import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { listActiveContactOutcomeTypes, listCompatibleCommercialIds } from "@/lib/classifications/contact-commercial";
import { listResultRegistrationAssociations } from "@/lib/classifications/result-associations";
import { listActiveTechnicalResultTypes } from "@/lib/classifications/technical-result";
import { all } from "@/lib/db";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();

  const [technical, contact, commercialRows, associations] = await Promise.all([
    listActiveTechnicalResultTypes(),
    listActiveContactOutcomeTypes(),
    all<{
      id: number;
      slug: string;
      name: string;
      description: string | null;
      status: string;
      collect_notes: boolean;
      require_schedule_return: boolean;
      requires_meeting: boolean;
      ask_decision_maker: boolean;
      mark_phone_verified: boolean;
      allowed_next_actions: unknown;
      lead_qualification: string | null;
      suggest_follow_up: boolean;
      require_final_registration: boolean;
    }>(
      `
        SELECT id, slug, name, description, status, collect_notes, require_schedule_return,
          requires_meeting, ask_decision_maker, mark_phone_verified, allowed_next_actions,
          lead_qualification, suggest_follow_up, require_final_registration
        FROM approach_result_types
        WHERE status = 'active' AND layer = 'commercial'
        ORDER BY sort_order, name
      `
    ),
    listResultRegistrationAssociations({ status: "active" }).catch(() => [])
  ]);

  const compat: Record<string, number[]> = {};
  for (const c of contact) {
    compat[String(c.id)] = await listCompatibleCommercialIds(c.id);
  }

  return Response.json({
    technical,
    contact,
    commercial: commercialRows,
    contact_commercial_compat: compat,
    result_registration_associations: associations.map((a) => ({
      id: a.id,
      call_technical_result_type_id: a.call_technical_result_type_id,
      commercial_result_type_id: a.commercial_result_type_id,
      pipeline_stage_id: a.pipeline_stage_id,
      collect_notes: a.collect_notes,
      require_schedule_return: a.require_schedule_return,
      require_final_registration: a.require_final_registration,
      ask_decision_maker: a.ask_decision_maker,
      mark_phone_verified: a.mark_phone_verified,
      allowed_next_actions: a.allowed_next_actions,
      status: a.status
    }))
  });
}
