import { all, get, nowIso, run } from "@/lib/db";

export type PipelineStageKind = "in_progress" | "won" | "lost";

export type PipelineStage = {
  id: number;
  name: string;
  sort_order: number;
  color: string;
  status: "active" | "inactive";
  kind: PipelineStageKind;
};

export async function listPipelineStages(activeOnly = true) {
  const where = activeOnly ? "WHERE status = 'active'" : "";
  return all<PipelineStage>(`SELECT * FROM pipeline_stages ${where} ORDER BY sort_order, id`);
}

export async function getPipelineStage(id: number) {
  return get<PipelineStage>("SELECT * FROM pipeline_stages WHERE id = @id", { id });
}

export async function upsertPipelineStage(input: {
  id?: number;
  name: string;
  sort_order: number;
  color: string;
  status: "active" | "inactive";
  kind: PipelineStageKind;
}) {
  const now = nowIso();
  if (input.id) {
    await run(
      `
        UPDATE pipeline_stages SET name = @name, sort_order = @sortOrder, color = @color,
          status = @status, kind = @kind, updated_at = @now
        WHERE id = @id
      `,
      {
        id: input.id,
        name: input.name,
        sortOrder: input.sort_order,
        color: input.color,
        status: input.status,
        kind: input.kind,
        now
      }
    );
    return input.id;
  }
  const r = await run(
    `
      INSERT INTO pipeline_stages (name, sort_order, color, status, kind, created_at, updated_at)
      VALUES (@name, @sortOrder, @color, @status, @kind, @now, @now)
    `,
    {
      name: input.name,
      sortOrder: input.sort_order,
      color: input.color,
      status: input.status,
      kind: input.kind,
      now
    }
  );
  return r.lastInsertRowid!;
}

export async function countOpportunitiesInStage(stageId: number) {
  const row = await get<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM opportunities WHERE pipeline_stage_id = @id",
    { id: stageId }
  );
  return row?.count ?? 0;
}

export async function deletePipelineStage(
  stageId: number,
  reassignToStageId: number | null,
  adminUserId: number
) {
  const stage = await getPipelineStage(stageId);
  if (!stage) throw new Error("NOT_FOUND");

  const oppCount = await countOpportunitiesInStage(stageId);
  if (oppCount > 0) {
    if (!reassignToStageId || reassignToStageId === stageId) {
      throw new Error("REASSIGN_REQUIRED");
    }
    const target = await getPipelineStage(reassignToStageId);
    if (!target || target.status !== "active") throw new Error("INVALID_TARGET");
    if (target.kind !== "in_progress") {
      throw new Error("REASSIGN_MUST_BE_IN_PROGRESS");
    }
  }

  const now = nowIso();
  const notes = `Realocados ao excluir a etapa “${stage.name}”.`;

  if (oppCount > 0 && reassignToStageId) {
    await run(
      `
        INSERT INTO opportunity_stage_logs (opportunity_id, from_stage_id, to_stage_id, user_id, notes, created_at)
        SELECT id, @fromId, @toId, @userId, @notes, @now
        FROM opportunities
        WHERE pipeline_stage_id = @fromId
      `,
      { fromId: stageId, toId: reassignToStageId, userId: adminUserId, notes, now }
    );
    await run(
      `
        UPDATE opportunities SET
          pipeline_stage_id = @toId,
          updated_at = @now,
          row_version = row_version + 1
        WHERE pipeline_stage_id = @fromId
      `,
      { fromId: stageId, toId: reassignToStageId, now }
    );
  }

  const deleted = await run("DELETE FROM pipeline_stages WHERE id = @id", { id: stageId });
  if (!deleted.changes) throw new Error("NOT_FOUND");
}
