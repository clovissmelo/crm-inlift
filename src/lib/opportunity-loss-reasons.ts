import { all, nowIso, run } from "@/lib/db";

export async function listLossReasons(activeOnly = true) {
  const where = activeOnly ? "WHERE status = 'active'" : "";
  return all<{ id: number; name: string; status: string }>(
    `SELECT id, name, status FROM opportunity_loss_reasons ${where} ORDER BY name`
  );
}

export async function upsertLossReason(input: { id?: number; name: string; status?: "active" | "inactive" }) {
  if (input.id) {
    await run(`UPDATE opportunity_loss_reasons SET name = @name, status = @status WHERE id = @id`, {
      id: input.id,
      name: input.name,
      status: input.status ?? "active"
    });
    return input.id;
  }
  const r = await run(
    `INSERT INTO opportunity_loss_reasons (name, status, created_at) VALUES (@name, @status, @now)`,
    { name: input.name, status: input.status ?? "active", now: nowIso() }
  );
  return r.lastInsertRowid!;
}
