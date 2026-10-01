import { requireAdminApi } from "@/lib/admin";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { listAttendanceRules, upsertAttendanceRule } from "@/lib/attendance/rules-repo";
import { OPERATIONAL_ACTION_LABELS, type OperationalAction } from "@/lib/attendance/operational-actions";
import { enforceRulesForAction } from "@/lib/attendance/operational-actions";
import { z } from "zod";

const actionEnum = z.enum([
  "auto_no_contact",
  "sem_contato",
  "pediu_retorno",
  "demonstrou_interesse",
  "sem_interesse",
  "reuniao_agendada"
]);

const createSchema = z.object({
  answered: z.boolean(),
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9_]+$/),
  operational_action: actionEnum,
  pipeline_stage_id: z.number().int().nullable().optional(),
  commercial_result_type_id: z.number().int().nullable().optional(),
  sort_order: z.number().int().optional(),
  status: z.enum(["active", "inactive"]).optional()
});

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;
  const items = await listAttendanceRules();
  return Response.json({
    items: items.map((r) => ({
      ...r,
      action_label: OPERATIONAL_ACTION_LABELS[r.operational_action],
      enforced: enforceRulesForAction(r.operational_action)
    }))
  });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;
  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const id = await upsertAttendanceRule({
    ...parsed.data,
    operational_action: parsed.data.operational_action as OperationalAction
  });
  return Response.json({ id }, { status: 201 });
}
