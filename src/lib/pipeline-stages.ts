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
