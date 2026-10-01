import { requireAdminApi } from "@/lib/admin";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { getAttendanceRuleById, upsertAttendanceRule } from "@/lib/attendance/rules-repo";
import type { OperationalAction } from "@/lib/attendance/operational-actions";
import { z } from "zod";

const patchSchema = z.object({
  answered: z.boolean().optional(),
  name: z.string().min(1).max(120).optional(),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9_]+$/).optional(),
  operational_action: z
    .enum([
      "auto_no_contact",
      "sem_contato",
      "pediu_retorno",
      "demonstrou_interesse",
      "sem_interesse",
      "reuniao_agendada"
    ])
    .optional(),
  pipeline_stage_id: z.number().int().nullable().optional(),
  commercial_result_type_id: z.number().int().nullable().optional(),
  sort_order: z.number().int().optional(),
  status: z.enum(["active", "inactive"]).optional()
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) return Response.json({ error: "ID inválido" }, { status: 400 });
  const existing = await getAttendanceRuleById(id);
  if (!existing) return Response.json({ error: "Regra não encontrada" }, { status: 404 });
  if (existing.is_system && existing.operational_action === "auto_no_contact") {
    return Response.json({ error: "Regra de sistema não pode ser alterada." }, { status: 403 });
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  await upsertAttendanceRule({
    id,
    answered: parsed.data.answered ?? existing.answered,
    name: parsed.data.name ?? existing.name,
    slug: parsed.data.slug ?? existing.slug,
    operational_action: (parsed.data.operational_action ?? existing.operational_action) as OperationalAction,
    pipeline_stage_id:
      parsed.data.pipeline_stage_id !== undefined ? parsed.data.pipeline_stage_id : existing.pipeline_stage_id,
    commercial_result_type_id:
      parsed.data.commercial_result_type_id !== undefined
        ? parsed.data.commercial_result_type_id
        : existing.commercial_result_type_id,
    sort_order: parsed.data.sort_order ?? existing.sort_order,
    status: (parsed.data.status ?? existing.status) as "active" | "inactive"
  });
  return Response.json({ ok: true });
}
