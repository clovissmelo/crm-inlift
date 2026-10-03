import { z } from "zod";
import { requireAdminApi } from "@/lib/admin";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { listProspeccaoPriorityTypes } from "@/lib/call-strategy/priorities-config";
import { nowIso, run } from "@/lib/db";
import { effectiveSortOrderForPatch, serializeRuleParams } from "@/lib/prospeccao-priority-queue-admin";
import { createProspeccaoPriorityType } from "@/lib/prospeccao-priority-types-repo";

const creatableRuleKindEnum = z.enum([
  "dial_round_tier",
  "overdue_return",
  "has_approach",
  "no_phone"
]);

const patchSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  color: z.string().max(32).optional(),
  sort_order: z.coerce.number().int().min(1).max(999_999).optional(),
  rule_kind: creatableRuleKindEnum.optional(),
  rule_params: z.record(z.string(), z.unknown()).optional()
});

const postSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  color: z.string().max(32).default("#64748b"),
  rule_kind: creatableRuleKindEnum,
  rule_params: z.record(z.string(), z.unknown()).optional()
});

export async function GET() {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;
  const items = await listProspeccaoPriorityTypes();
  return Response.json({ items });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const denied = requireAdminApi(user);
  if (denied) return denied;

  const body = await request.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  try {
    await createProspeccaoPriorityType(parsed.data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao criar prioridade";
    return Response.json({ error: message }, { status: 400 });
  }

  return Response.json({ items: await listProspeccaoPriorityTypes() }, { status: 201 });
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
  const row = await listProspeccaoPriorityTypes().then((rows) => rows.find((r) => r.id === parsed.data.id));
  if (!row) return Response.json({ error: "Prioridade não encontrada" }, { status: 404 });

  const anchor = row.queue_anchor ?? "none";
  if (parsed.data.rule_kind !== undefined || parsed.data.rule_params !== undefined) {
    if (anchor !== "none" || row.is_system) {
      return Response.json({ error: "Regra desta prioridade não pode ser alterada." }, { status: 403 });
    }
    if (parsed.data.rule_kind === "dial_round_tier") {
      const round = parsed.data.rule_params?.round;
      if (typeof round !== "number" || !Number.isInteger(round) || round < 1 || round > 99) {
        return Response.json({ error: "Informe a rodada de ligação (1–99)." }, { status: 400 });
      }
    }
  }

  const sortOrder = effectiveSortOrderForPatch(row, parsed.data.sort_order);
  const ruleKind = parsed.data.rule_kind ?? row.rule_kind;

  let paramsSet = false;
  let ruleParams: string | null = null;
  if (parsed.data.rule_params !== undefined) {
    paramsSet = true;
    ruleParams = serializeRuleParams(parsed.data.rule_params);
  } else if (parsed.data.rule_kind !== undefined && parsed.data.rule_kind !== "dial_round_tier") {
    paramsSet = true;
    ruleParams = null;
  } else if (parsed.data.rule_kind === "dial_round_tier" && parsed.data.rule_params === undefined) {
    return Response.json({ error: "Informe a rodada de ligação (1–99)." }, { status: 400 });
  }

  await run(
    `
      UPDATE prospeccao_priority_types SET
        name = COALESCE(@name, name),
        description = CASE WHEN @descSet THEN @description ELSE description END,
        color = COALESCE(@color, color),
        sort_order = @sortOrder,
        rule_kind = CASE WHEN @ruleSet THEN @ruleKind ELSE rule_kind END,
        rule_params = CASE WHEN @paramsSet THEN @ruleParams ELSE rule_params END,
        updated_at = @now
      WHERE id = @id
    `,
    {
      id: parsed.data.id,
      name: parsed.data.name ?? null,
      descSet: parsed.data.description !== undefined,
      description: parsed.data.description ?? null,
      color: parsed.data.color ?? null,
      sortOrder,
      ruleSet: parsed.data.rule_kind !== undefined,
      ruleKind,
      paramsSet,
      ruleParams,
      now: nowIso()
    }
  );

  return Response.json({ items: await listProspeccaoPriorityTypes() });
}
