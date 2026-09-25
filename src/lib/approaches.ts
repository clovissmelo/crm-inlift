import { get, nowIso, run } from "@/lib/db";

export type ApproachChannel = "call" | "whatsapp" | "email";

export type NextActionInput =
  | { type: "none" }
  | {
      type: "schedule_return" | "schedule_meeting";
      scheduled_at: string;
      contact_id?: number | null;
      product_id?: number | null;
      notes?: string | null;
    }
  | {
      type: "pause" | "close";
      product_id: number;
      reason_id: number;
    };

export async function createApproach(input: {
  client_id: number;
  contact_id?: number | null;
  product_id?: number | null;
  user_id: number;
  channel: ApproachChannel;
  occurred_at?: string | null;
  result_type_id: number;
  notes?: string | null;
  external_call_id?: string | null;
  next_action: NextActionInput;
}) {
  const occurredAt = input.occurred_at ?? nowIso();
  const recordedAt = nowIso();

  const approachResult = await run(
    `
      INSERT INTO approaches (
        client_id, contact_id, product_id, user_id, channel, notes,
        occurred_at, recorded_at, result_type_id, external_call_id, created_at
      ) VALUES (
        @clientId, @contactId, @productId, @userId, @channel, @notes,
        @occurredAt, @recordedAt, @resultTypeId, @externalCallId, @createdAt
      )
    `,
    {
      clientId: input.client_id,
      contactId: input.contact_id ?? null,
      productId: input.product_id ?? null,
      userId: input.user_id,
      channel: input.channel,
      notes: input.notes ?? null,
      occurredAt,
      recordedAt,
      resultTypeId: input.result_type_id,
      externalCallId: input.external_call_id ?? null,
      createdAt: recordedAt
    }
  );

  const approachId = approachResult.lastInsertRowid;
  if (!approachId) throw new Error("Falha ao registrar abordagem");

  await handleNextAction(input.client_id, approachId, input.user_id, input.next_action);

  return approachId;
}

async function handleNextAction(clientId: number, approachId: number, userId: number, action: NextActionInput) {
  if (action.type === "none") return;

  if (action.type === "schedule_meeting") {
    const { createMeetingFromApproach } = await import("@/lib/meetings");
    const client = await get<{ bdr_user_id: number | null }>("SELECT bdr_user_id FROM clients WHERE id = @id", {
      id: clientId
    });
    const bdr = client?.bdr_user_id ?? userId;
    await createMeetingFromApproach({
      client_id: clientId,
      product_id: action.product_id,
      contact_id: action.contact_id,
      bdr_user_id: bdr,
      source_approach_id: approachId,
      starts_at: action.scheduled_at,
      notes: action.notes,
      created_by_user_id: userId
    });
    return;
  }

  if (action.type === "schedule_return") {
    const client = await get<{ bdr_user_id: number | null }>("SELECT bdr_user_id FROM clients WHERE id = @id", {
      id: clientId
    });
    const assigned = client?.bdr_user_id ?? userId;
    await run(
      `
        INSERT INTO follow_ups (
          client_id, contact_id, product_id, source_approach_id, kind,
          assigned_user_id, created_by_user_id, scheduled_at, status, notes, created_at, updated_at
        ) VALUES (
          @clientId, @contactId, @productId, @approachId, 'return',
          @assignedUserId, @createdBy, @scheduledAt, 'pending', @notes, @now, @now
        )
      `,
      {
        clientId,
        contactId: action.contact_id ?? null,
        productId: action.product_id ?? null,
        approachId,
        assignedUserId: assigned,
        createdBy: userId,
        scheduledAt: action.scheduled_at,
        notes: action.notes ?? null,
        now: nowIso()
      }
    );
    return;
  }

  if (action.type !== "pause" && action.type !== "close") return;

  const productId = action.product_id;
  const reasonId = action.reason_id;
  const open = await get<{ id: number }>(
    `
      SELECT id FROM opportunities
      WHERE client_id = @clientId AND product_id = @productId AND outcome = 'open'
      ORDER BY updated_at DESC LIMIT 1
    `,
    { clientId, productId }
  );
  const engagement = action.type === "pause" ? "paused" : "closed";
  if (open) {
    await run(
      `
        UPDATE opportunities SET engagement_status = @status, pause_reason_id = @pauseReasonId,
          close_reason_id = @closeReasonId, status_changed_at = @now, status_changed_by_user_id = @userId,
          updated_at = @now, row_version = row_version + 1
        WHERE id = @id
      `,
      {
        id: open.id,
        status: engagement,
        pauseReasonId: action.type === "pause" ? reasonId : null,
        closeReasonId: action.type === "close" ? reasonId : null,
        now: nowIso(),
        userId
      }
    );
  } else {
    const { createOpportunity } = await import("@/lib/opportunity-pipeline");
    const newId = await createOpportunity({
      client_id: clientId,
      product_id: productId,
      title: "",
      created_by_user_id: userId
    });
    await run(
      `
        UPDATE opportunities SET engagement_status = @status, pause_reason_id = @pauseReasonId,
          close_reason_id = @closeReasonId, status_changed_at = @now, status_changed_by_user_id = @userId
        WHERE id = @id
      `,
      {
        id: newId,
        status: engagement,
        pauseReasonId: action.type === "pause" ? reasonId : null,
        closeReasonId: action.type === "close" ? reasonId : null,
        now: nowIso(),
        userId
      }
    );
  }
}

export async function getLastApproachForClient(clientId: number) {
  return get<{
    id: number;
    channel: string;
    occurred_at: string;
    notes: string | null;
    result_name: string | null;
    user_name: string | null;
  }>(
    `
      SELECT a.id, a.channel, a.occurred_at, a.notes, rt.name AS result_name, u.name AS user_name
      FROM approaches a
      LEFT JOIN approach_result_types rt ON rt.id = a.result_type_id
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.client_id = @clientId
      ORDER BY a.occurred_at DESC, a.id DESC
      LIMIT 1
    `,
    { clientId }
  );
}
