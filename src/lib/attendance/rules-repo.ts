import { all, get, nowIso, run } from "@/lib/db";
import type { OperationalAction } from "@/lib/attendance/operational-actions";

export type AttendanceRuleRow = {
  id: number;
  answered: boolean;
  name: string;
  slug: string;
  operational_action: OperationalAction;
  pipeline_stage_id: number | null;
  commercial_result_type_id: number | null;
  sort_order: number;
  status: string;
  is_system: boolean;
};

export async function listAttendanceRules(activeOnly = false): Promise<AttendanceRuleRow[]> {
  return all<AttendanceRuleRow>(
    `
      SELECT id, answered, name, slug, operational_action, pipeline_stage_id,
        commercial_result_type_id, sort_order, status, is_system
      FROM attendance_rules
      ${activeOnly ? "WHERE status = 'active'" : ""}
      ORDER BY answered DESC, sort_order, id
    `
  );
}

export async function getAttendanceRuleById(id: number) {
  return get<AttendanceRuleRow>(
    `
      SELECT id, answered, name, slug, operational_action, pipeline_stage_id,
        commercial_result_type_id, sort_order, status, is_system
      FROM attendance_rules WHERE id = @id
    `,
    { id }
  );
}

export async function getAttendanceRuleByCommercialTypeId(commercialTypeId: number) {
  return get<AttendanceRuleRow>(
    `
      SELECT id, answered, name, slug, operational_action, pipeline_stage_id,
        commercial_result_type_id, sort_order, status, is_system
      FROM attendance_rules
      WHERE commercial_result_type_id = @id AND status = 'active'
      LIMIT 1
    `,
    { id: commercialTypeId }
  );
}

export async function getAttendanceRuleBySlug(slug: string) {
  return get<AttendanceRuleRow>(
    `
      SELECT id, answered, name, slug, operational_action, pipeline_stage_id,
        commercial_result_type_id, sort_order, status, is_system
      FROM attendance_rules
      WHERE slug = @slug AND status = 'active'
      LIMIT 1
    `,
    { slug }
  );
}

export async function upsertAttendanceRule(input: {
  id?: number;
  answered: boolean;
  name: string;
  slug: string;
  operational_action: OperationalAction;
  pipeline_stage_id?: number | null;
  commercial_result_type_id?: number | null;
  sort_order?: number;
  status?: "active" | "inactive";
}): Promise<number> {
  const now = nowIso();
  if (input.id) {
    await run(
      `
        UPDATE attendance_rules SET
          answered = @answered, name = @name, slug = @slug, operational_action = @action,
          pipeline_stage_id = @stageId, commercial_result_type_id = @commercialId,
          sort_order = @sortOrder, status = @status, updated_at = @now
        WHERE id = @id AND slug <> 'auto_no_contact'
      `,
      {
        id: input.id,
        answered: input.answered,
        name: input.name,
        slug: input.slug,
        action: input.operational_action,
        stageId: input.pipeline_stage_id ?? null,
        commercialId: input.commercial_result_type_id ?? null,
        sortOrder: input.sort_order ?? 0,
        status: input.status ?? "active",
        now
      }
    );
    return input.id;
  }
  const res = await run(
    `
      INSERT INTO attendance_rules (
        answered, name, slug, operational_action, pipeline_stage_id,
        commercial_result_type_id, sort_order, status, is_system, created_at, updated_at
      ) VALUES (
        @answered, @name, @slug, @action, @stageId, @commercialId, @sortOrder, @status, false, @now, @now
      )
    `,
    {
      answered: input.answered,
      name: input.name,
      slug: input.slug,
      action: input.operational_action,
      stageId: input.pipeline_stage_id ?? null,
      commercialId: input.commercial_result_type_id ?? null,
      sortOrder: input.sort_order ?? 0,
      status: input.status ?? "active",
      now
    }
  );
  return Number(res.lastInsertRowid);
}
