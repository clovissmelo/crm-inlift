import { updateResultRegistrationAssociation } from "@/lib/classifications/result-associations";
import { getTechnicalResultTypeById } from "@/lib/classifications/technical-result";
import { requireAdminApi } from "@/lib/admin";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { get } from "@/lib/db";
import { z } from "zod";

const patchSchema = z.object({
  call_technical_result_type_id: z.number().int().positive().optional(),
  commercial_result_type_id: z.number().int().positive().optional(),
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

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;

  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id)) return Response.json({ error: "ID inválido" }, { status: 400 });

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const data = parsed.data;
  const technicalId = data.call_technical_result_type_id;
  if (technicalId != null) {
    const technical = await getTechnicalResultTypeById(technicalId);
    if (!technical || technical.status !== "active") {
      return Response.json({ error: "Resultado da ligação inválido." }, { status: 400 });
    }
    if (data.atendimento_answered != null && data.atendimento_answered !== technical.answered) {
      return Response.json(
        { error: "Atendimento não corresponde ao resultado da ligação selecionado." },
        { status: 400 }
      );
    }
  }

  if (data.commercial_result_type_id != null) {
    const commercial = await get<{ id: number; status: string; layer: string }>(
      "SELECT id, status, layer FROM approach_result_types WHERE id = @id",
      { id: data.commercial_result_type_id }
    );
    if (!commercial || commercial.status !== "active" || commercial.layer !== "commercial") {
      return Response.json({ error: "Resultado comercial inválido." }, { status: 400 });
    }
  }

  try {
    await updateResultRegistrationAssociation(id, data);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "DUPLICATE_PAIR") {
      return Response.json({ error: "Par ligação × comercial já existe em outra associação." }, { status: 409 });
    }
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return Response.json({ error: "Associação não encontrada." }, { status: 404 });
    }
    return Response.json({ error: "Não foi possível salvar." }, { status: 400 });
  }
}
