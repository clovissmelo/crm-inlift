import {
  createResultRegistrationAssociation,
  listResultRegistrationAssociations
} from "@/lib/classifications/result-associations";
import { getTechnicalResultTypeById } from "@/lib/classifications/technical-result";
import { requireAdminApi } from "@/lib/admin";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { get } from "@/lib/db";
import { z } from "zod";

const upsertSchema = z.object({
  call_technical_result_type_id: z.number().int().positive(),
  commercial_result_type_id: z.number().int().positive(),
  pipeline_stage_id: z.number().int().positive().nullable().optional(),
  collect_notes: z.boolean().nullable().optional(),
  require_schedule_return: z.boolean().nullable().optional(),
  require_final_registration: z.boolean().nullable().optional(),
  ask_decision_maker: z.boolean().nullable().optional(),
  mark_phone_verified: z.boolean().nullable().optional(),
  allowed_next_actions: z.array(z.string()).nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  atendimento_answered: z.boolean().optional(),
  dial_counts_for_exhaustion: z.boolean().optional(),
  dial_occurrence_kind: z
    .enum(["no_answer", "invalid", "wrong_number", "technical_fail", "conversation_success"])
    .nullable()
    .optional(),
  dial_occurrence_limit: z.number().int().min(1).max(50).nullable().optional(),
  dial_min_interval_minutes: z.number().int().min(0).max(60 * 24 * 14).nullable().optional(),
  dial_limit_action: z.enum(["exhaust_phone", "flag_review"]).nullable().optional()
});

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const items = await listResultRegistrationAssociations({ status: "all" });
  return Response.json({ items });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;

  const body = await request.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const data = parsed.data;
  const technical = await getTechnicalResultTypeById(data.call_technical_result_type_id);
  if (!technical || technical.status !== "active") {
    return Response.json({ error: "Resultado da ligação inválido." }, { status: 400 });
  }
  if (data.atendimento_answered != null && data.atendimento_answered !== technical.answered) {
    return Response.json(
      { error: "Atendimento não corresponde ao resultado da ligação selecionado." },
      { status: 400 }
    );
  }

  const commercial = await get<{ id: number; status: string; layer: string }>(
    "SELECT id, status, layer FROM approach_result_types WHERE id = @id",
    { id: data.commercial_result_type_id }
  );
  if (!commercial || commercial.status !== "active" || commercial.layer !== "commercial") {
    return Response.json({ error: "Resultado comercial inválido." }, { status: 400 });
  }

  try {
    const id = await createResultRegistrationAssociation({
      call_technical_result_type_id: data.call_technical_result_type_id,
      commercial_result_type_id: data.commercial_result_type_id,
      pipeline_stage_id: data.pipeline_stage_id ?? null,
      collect_notes: data.collect_notes ?? null,
      require_schedule_return: data.require_schedule_return ?? null,
      require_final_registration: data.require_final_registration ?? null,
      ask_decision_maker: data.ask_decision_maker ?? null,
      mark_phone_verified: data.mark_phone_verified ?? null,
      allowed_next_actions: data.allowed_next_actions ?? null,
      dial_counts_for_exhaustion: data.dial_counts_for_exhaustion ?? false,
      dial_occurrence_kind: data.dial_occurrence_kind ?? null,
      dial_occurrence_limit: data.dial_occurrence_limit ?? null,
      dial_min_interval_minutes: data.dial_min_interval_minutes ?? null,
      dial_limit_action: data.dial_limit_action ?? null,
      status: data.status ?? "active"
    });
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "DUPLICATE_PAIR") {
      return Response.json(
        { error: "Já existe uma associação com este par (ligaçao × comercial). Edite a existente ou desative-a." },
        { status: 409 }
      );
    }
    return Response.json({ error: "Não foi possível criar a associação." }, { status: 400 });
  }
}
