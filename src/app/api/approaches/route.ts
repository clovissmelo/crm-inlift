import { validateNextActionChoice, type ApproachNextActionKey } from "@/lib/approach-next-actions";
import { createApproach, markLeadContactPhoneVerified } from "@/lib/approaches";
import { getContactOutcomeTypeById } from "@/lib/classifications/contact-commercial";
import { getTechnicalResultTypeById } from "@/lib/classifications/technical-result";
import { associationOverrides, mergeRegistrationRules } from "@/lib/classifications/registration-rules";
import { getActiveAssociationForPair } from "@/lib/classifications/result-associations";
import { getAttendanceRuleByCommercialTypeId } from "@/lib/attendance/rules-repo";
import { enforceRulesForAction } from "@/lib/attendance/operational-actions";
import { exitProspeccaoForProduct } from "@/lib/client-product-prospeccao";
import { validateThreeLayerApproach } from "@/lib/classifications/validate-approach-registration";
import { moveOpportunityStage } from "@/lib/opportunity-pipeline";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { get, nowIso, run } from "@/lib/db";
import { completeFollowUp } from "@/lib/follow-ups";
import { approachCreateSchema } from "@/lib/validators";
import { recordDialAttemptFromApproach } from "@/lib/call-strategy/record-attempt";
import { exitProspeccaoCommercial } from "@/lib/call-strategy/queue-eval";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();

  const body = await request.json();
  const parsed = approachCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const data = parsed.data;
  const registrationStatus = data.registration_status ?? "final";

  if (data.api4com_call_row_id) {
    const dup = await get<{ id: number }>(
      "SELECT id FROM approaches WHERE api4com_call_row_id = @callRowId LIMIT 1",
      { callRowId: data.api4com_call_row_id }
    );
    if (dup) {
      return Response.json({ error: "Esta ligação já possui atendimento registrado." }, { status: 409 });
    }
  }

  const resultType = await get<{
    name: string;
    suggest_follow_up: boolean;
    lead_qualification: string | null;
    require_schedule_return: boolean;
    requires_meeting: boolean;
    allowed_next_actions: unknown;
    ask_decision_maker: boolean;
    mark_phone_verified: boolean;
    collect_notes: boolean;
    require_final_registration: boolean;
    layer: string;
  }>(
    `SELECT name, suggest_follow_up, lead_qualification, require_schedule_return, requires_meeting,
      allowed_next_actions, ask_decision_maker, mark_phone_verified, collect_notes, require_final_registration, layer
     FROM approach_result_types WHERE id = @id AND status = 'active'`,
    { id: data.result_type_id }
  );
  if (!resultType) return Response.json({ error: "Resultado inválido" }, { status: 400 });

  let technicalTypeId: number | null = null;
  if (data.api4com_call_row_id) {
    const callRow = await get<{ technical_result_type_id: number | null }>(
      "SELECT technical_result_type_id FROM api4com_calls WHERE id = @id",
      { id: data.api4com_call_row_id }
    );
    technicalTypeId = callRow?.technical_result_type_id ?? null;
  }
  const associationRow =
    technicalTypeId != null
      ? await getActiveAssociationForPair(technicalTypeId, data.result_type_id)
      : null;
  const attendanceRule = await getAttendanceRuleByCommercialTypeId(data.result_type_id);
  const enforced = attendanceRule
    ? enforceRulesForAction(attendanceRule.operational_action)
    : null;
  const effectiveRules = enforced
    ? { ...mergeRegistrationRules(resultType, associationOverrides(associationRow)), ...enforced }
    : mergeRegistrationRules(resultType, associationOverrides(associationRow));
  const pipelineStageId =
    attendanceRule?.pipeline_stage_id ?? associationRow?.pipeline_stage_id ?? null;

  const layerErr = await validateThreeLayerApproach({
    channel: data.channel,
    registration_status: registrationStatus,
    contact_outcome_type_id: data.contact_outcome_type_id,
    result_type_id: data.result_type_id,
    api4com_call_row_id: data.api4com_call_row_id,
    contacted_person_name: data.contacted_person_name,
    contacted_person_job_title: data.contacted_person_job_title,
    linked_contact_id: data.linked_contact_id
  });
  if (layerErr) return Response.json({ error: layerErr }, { status: 400 });

  if (registrationStatus === "final") {
    if (effectiveRules.ask_decision_maker && typeof data.spoke_with_decision_maker !== "boolean") {
      return Response.json({ error: "Informe se houve contato com o decisor." }, { status: 400 });
    }

    const nextValidation = validateNextActionChoice(
      { allowed_next_actions: effectiveRules.allowed_next_actions, require_schedule_return: effectiveRules.require_schedule_return },
      data.next_action.type as ApproachNextActionKey
    );
    if (nextValidation) return Response.json({ error: nextValidation }, { status: 400 });

    if (effectiveRules.require_schedule_return && data.next_action.type !== "schedule_return") {
      return Response.json({ error: "Este resultado exige data e horário de retorno." }, { status: 400 });
    }
    if (effectiveRules.requires_meeting && data.next_action.type !== "schedule_meeting") {
      return Response.json({ error: "Este resultado exige reunião agendada." }, { status: 400 });
    }
  }

  if (data.occurred_at) {
    const occurred = new Date(data.occurred_at);
    if (occurred.getTime() > Date.now()) {
      return Response.json({ error: "Data da abordagem não pode ser futura." }, { status: 400 });
    }
  }

  let contactSnapshot: string | null = null;
  if (data.contact_outcome_type_id) {
    const co = await getContactOutcomeTypeById(data.contact_outcome_type_id);
    contactSnapshot = co?.name ?? null;
  }
  let technicalSnapshot: string | null = null;
  if (data.api4com_call_row_id) {
    const call = await get<{ technical_result_type_id: number | null }>(
      "SELECT technical_result_type_id FROM api4com_calls WHERE id = @id",
      { id: data.api4com_call_row_id }
    );
    if (call?.technical_result_type_id) {
      const t = await getTechnicalResultTypeById(call.technical_result_type_id);
      technicalSnapshot = t?.display_name ?? null;
    }
  }

  try {
    const approachId = await createApproach({
      client_id: data.client_id,
      contact_id: data.contact_id,
      product_id: data.product_id,
      user_id: user.id,
      channel: data.channel,
      occurred_at: data.occurred_at,
      result_type_id: data.result_type_id,
      notes: data.notes,
      external_call_id: data.external_call_id,
      spoke_with_decision_maker: effectiveRules.ask_decision_maker ? data.spoke_with_decision_maker : null,
      next_action: registrationStatus === "final" ? data.next_action : { type: "none" },
      api4com_call_row_id: data.api4com_call_row_id,
      contact_outcome_type_id: data.contact_outcome_type_id,
      contact_outcome_name_snapshot: contactSnapshot,
      commercial_result_name_snapshot: resultType.name,
      technical_result_name_snapshot: technicalSnapshot,
      contacted_person_name: data.contacted_person_name,
      contacted_person_job_title: data.contacted_person_job_title,
      contacted_person_notes: data.contacted_person_notes,
      linked_contact_id: data.linked_contact_id,
      registration_status: registrationStatus
    });

    if (data.follow_up_id) {
      await completeFollowUp(data.follow_up_id, user.id, approachId);
    }

    if (
      registrationStatus === "final" &&
      (resultType.lead_qualification === "cold" ||
        resultType.lead_qualification === "warm" ||
        resultType.lead_qualification === "hot")
    ) {
      await run(
        `
          UPDATE clients SET lead_qualification = @qual, updated_at = @now
          WHERE id = @clientId
        `,
        {
          qual: resultType.lead_qualification,
          clientId: data.client_id,
          now: nowIso()
        }
      );
    }

    if (registrationStatus === "final") {
      await recordDialAttemptFromApproach({
        approachId,
        clientId: data.client_id,
        userId: user.id,
        contactId: data.contact_id,
        productId: data.product_id,
        api4comCallRowId: data.api4com_call_row_id,
        resultTypeId: data.result_type_id,
        contactOutcomeTypeId: data.contact_outcome_type_id
      });

      if (enforced?.exit_prospeccao_product && data.product_id) {
        const reason =
          attendanceRule?.operational_action === "reuniao_agendada"
            ? "reuniao_agendada"
            : attendanceRule?.operational_action === "sem_interesse"
              ? "sem_interesse"
              : "commercial_close";
        await exitProspeccaoForProduct(data.client_id, data.product_id, reason);
      } else if (data.next_action.type === "close" && data.product_id) {
        await exitProspeccaoForProduct(data.client_id, data.product_id, "commercial_close");
      } else if (data.next_action.type === "close") {
        await exitProspeccaoCommercial(data.client_id, "commercial_close");
      }
    }

    if (effectiveRules.mark_phone_verified) {
      await markLeadContactPhoneVerified(data.client_id, data.contact_id);
    }

    if (registrationStatus === "final" && pipelineStageId && data.product_id) {
      const opp = await get<{ id: number; row_version: number }>(
        `
          SELECT id, row_version FROM opportunities
          WHERE client_id = @clientId AND product_id = @productId AND outcome = 'open'
          ORDER BY updated_at DESC LIMIT 1
        `,
        { clientId: data.client_id, productId: data.product_id }
      );
      if (opp) {
        try {
          await moveOpportunityStage({
            opportunity_id: opp.id,
            to_stage_id: pipelineStageId,
            user_id: user.id,
            expected_version: opp.row_version,
            lost_reason_id:
              data.next_action.type === "close" ? data.next_action.reason_id : undefined,
            lost_notes: enforced?.move_pipeline_lost ? data.notes ?? null : undefined,
            notes: enforced?.move_pipeline_lost
              ? "Perda registrada pelo resultado do atendimento."
              : "Movimentação automática pelo resultado do atendimento."
          });
        } catch {
          /* não bloqueia registro se funil não puder mover */
        }
      }
    }

    return Response.json({ id: approachId }, { status: 201 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro ao salvar" }, { status: 400 });
  }
}
