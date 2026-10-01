import { get, nowIso, run } from "@/lib/db";
import { createMeeting, suggestInternalParticipants } from "@/lib/meetings";
import type { StageEnterActionPayload } from "@/lib/pipeline-stage-enter-rules";

export async function applyPipelineStageEnterEffects(input: {
  client_id: number;
  product_id: number;
  opportunity_id: number;
  user_id: number;
  enter_action?: StageEnterActionPayload | null;
}) {
  const action = input.enter_action;
  if (!action) return;
  const now = nowIso();

  if (action.type === "pause") {
    await run(
      `
        UPDATE opportunities SET
          engagement_status = 'paused',
          pause_reason_id = @reasonId,
          status_changed_at = @now,
          status_changed_by_user_id = @userId,
          updated_at = @now,
          row_version = row_version + 1
        WHERE id = @id
      `,
      {
        id: input.opportunity_id,
        reasonId: action.reason_id!,
        now,
        userId: input.user_id
      }
    );
    return;
  }

  const client = await get<{ bdr_user_id: number | null }>("SELECT bdr_user_id FROM clients WHERE id = @id", {
    id: input.client_id
  });
  const assigned = client?.bdr_user_id ?? input.user_id;

  if (action.type === "schedule_return") {
    await run(
      `
        INSERT INTO follow_ups (
          client_id, product_id, kind, assigned_user_id, created_by_user_id,
          scheduled_at, status, notes, created_at, updated_at
        ) VALUES (
          @clientId, @productId, 'return', @assignedUserId, @createdBy,
          @scheduledAt, 'pending', @notes, @now, @now
        )
      `,
      {
        clientId: input.client_id,
        productId: input.product_id,
        assignedUserId: assigned,
        createdBy: input.user_id,
        scheduledAt: action.scheduled_at!,
        notes: action.notes ?? null,
        now
      }
    );
    await run(
      `UPDATE opportunities SET next_action_at = @at, updated_at = @now WHERE id = @id`,
      { id: input.opportunity_id, at: action.scheduled_at!, now }
    );
    return;
  }

  if (action.type === "schedule_meeting") {
    const internal = await suggestInternalParticipants(input.product_id, assigned);
    const c = await get<{ trade_name: string | null; legal_name: string | null }>(
      "SELECT trade_name, legal_name FROM clients WHERE id = @id",
      { id: input.client_id }
    );
    const name = c?.trade_name || c?.legal_name || "Cliente";
    await createMeeting({
      client_id: input.client_id,
      product_id: input.product_id,
      opportunity_id: input.opportunity_id,
      bdr_user_id: assigned,
      title: `Reunião — ${name}`,
      starts_at: action.scheduled_at!,
      duration_minutes: 30,
      notes: action.notes ?? null,
      internal_user_ids: internal.map((u) => u.id),
      external_participants: [],
      created_by_user_id: input.user_id,
      idempotency_key: `stage-enter-${input.opportunity_id}-${action.scheduled_at}`
    });
    await run(
      `UPDATE opportunities SET next_action_at = @at, updated_at = @now WHERE id = @id`,
      { id: input.opportunity_id, at: action.scheduled_at!, now }
    );
  }
}
