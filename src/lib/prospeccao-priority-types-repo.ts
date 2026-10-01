import { listProspeccaoPriorityTypes } from "@/lib/call-strategy/priorities-config";
import { all, get, nowIso, run } from "@/lib/db";
import {
  normalizePrioritySortOrders,
  serializeRuleParams,
  slugifyPriorityName,
  type CreatableRuleKind
} from "@/lib/prospeccao-priority-queue-admin";

export async function persistNormalizedPrioritySortOrders(): Promise<void> {
  const items = await listProspeccaoPriorityTypes();
  const normalized = normalizePrioritySortOrders(items);
  const now = nowIso();
  for (const row of normalized) {
    await run(
      `
        UPDATE prospeccao_priority_types
        SET sort_order = @sortOrder, updated_at = @now
        WHERE id = @id
      `,
      { id: row.id, sortOrder: row.sort_order, now }
    );
  }
}

async function ensureUniqueSlug(base: string): Promise<string> {
  let slug = base || "prioridade";
  let n = 2;
  while (
    await get<{ ok: number }>(
      `SELECT 1 AS ok FROM prospeccao_priority_types WHERE slug = @slug LIMIT 1`,
      { slug }
    )
  ) {
    slug = `${base}_${n}`;
    n += 1;
  }
  return slug;
}

export async function createProspeccaoPriorityType(input: {
  name: string;
  description?: string | null;
  color: string;
  rule_kind: CreatableRuleKind;
  rule_params?: Record<string, unknown>;
}): Promise<number> {
  if (input.rule_kind === "dial_round_tier") {
    const round = input.rule_params?.round;
    if (typeof round !== "number" || !Number.isInteger(round) || round < 1 || round > 99) {
      throw new Error("Informe a rodada de ligação (1–99).");
    }
  }

  const baseSlug =
    input.rule_kind === "dial_round_tier" && typeof input.rule_params?.round === "number"
      ? `ligacao_${input.rule_params.round}`
      : slugifyPriorityName(input.name);
  const slug = await ensureUniqueSlug(baseSlug);
  const ruleParams = serializeRuleParams(input.rule_params ?? {});
  const now = nowIso();

  const result = await run(
    `
      INSERT INTO prospeccao_priority_types (
        slug, name, description, color, sort_order, rule_kind, rule_params,
        queue_anchor, is_system, status, created_at, updated_at
      ) VALUES (
        @slug, @name, @description, @color, 500, @ruleKind, @ruleParams,
        'none', false, 'active', @now, @now
      )
    `,
    {
      slug,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      color: input.color,
      ruleKind: input.rule_kind,
      ruleParams,
      now
    }
  );

  await persistNormalizedPrioritySortOrders();
  return result.lastInsertRowid ?? 0;
}

export async function deleteProspeccaoPriorityType(id: number): Promise<void> {
  await run(`DELETE FROM prospeccao_priority_types WHERE id = @id`, { id });
  await persistNormalizedPrioritySortOrders();
}

export async function getProspeccaoPriorityTypeById(id: number) {
  return get<{
    id: number;
    slug: string;
    queue_anchor: string;
    is_system: boolean;
    rule_kind: string;
  }>(
    `
      SELECT id, slug, COALESCE(queue_anchor, 'none') AS queue_anchor,
        COALESCE(is_system, true) AS is_system, rule_kind
      FROM prospeccao_priority_types
      WHERE id = @id AND status = 'active'
    `,
    { id }
  );
}

export async function listActivePriorityIds(): Promise<number[]> {
  const rows = await all<{ id: number }>(
    `SELECT id FROM prospeccao_priority_types WHERE status = 'active' ORDER BY sort_order, id`
  );
  return rows.map((r) => r.id);
}
