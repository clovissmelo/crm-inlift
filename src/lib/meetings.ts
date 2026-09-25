import { all, get, nowIso, run } from "@/lib/db";
import { meetingEndIso } from "@/lib/datetime";
import { cancelMeetingOnGoogle, syncMeetingToGoogle } from "@/lib/google-calendar";
import type { MeetingStatus } from "@/lib/meeting-constants";

export type { MeetingStatus } from "@/lib/meeting-constants";
export { MEETING_STATUS_LABELS } from "@/lib/meeting-constants";

export async function suggestInternalParticipants(productId: number | null, bdrUserId: number) {
  const ids = new Set<number>([bdrUserId]);
  if (productId) {
    const rows = await all<{ user_id: number }>(
      "SELECT user_id FROM product_responsibles WHERE product_id = @productId",
      { productId }
    );
    for (const r of rows) ids.add(r.user_id);
  }
  const idList = [...ids].join(",");
  if (!idList) return [];
  return all<{ id: number; name: string; email: string }>(
    `SELECT id, name, email FROM users WHERE id IN (${idList}) AND status = 'active' ORDER BY name`
  );
}

export async function findMeetingConflicts(userIds: number[], startsAt: string, durationMinutes: number, excludeMeetingId?: number) {
  if (!userIds.length) return [];
  const end = meetingEndIso(startsAt, durationMinutes);
  const ids = userIds.join(",");
  const exclude = excludeMeetingId ? `AND m.id <> ${excludeMeetingId}` : "";
  return all<{ id: number; title: string; starts_at: string; duration_minutes: number; user_name: string }>(
    `
      SELECT DISTINCT m.id, m.title, m.starts_at, m.duration_minutes, u.name AS user_name
      FROM meetings m
      JOIN meeting_internal_participants mip ON mip.meeting_id = m.id
      JOIN users u ON u.id = mip.user_id
      WHERE mip.user_id IN (${ids})
        AND m.status NOT IN ('cancelled')
        ${exclude}
        AND tstzrange(m.starts_at, m.starts_at + (m.duration_minutes || ' minutes')::interval)
            && tstzrange(@startsAt::timestamptz, @endsAt::timestamptz)
    `,
    { startsAt, endsAt: end }
  );
}

async function logStatus(meetingId: number, fromStatus: string | null, toStatus: string, userId: number, reason?: string | null) {
  await run(
    `
      INSERT INTO meeting_status_logs (meeting_id, from_status, to_status, user_id, reason, created_at)
      VALUES (@meetingId, @from, @to, @userId, @reason, @now)
    `,
    { meetingId, from: fromStatus, to: toStatus, userId, reason: reason ?? null, now: nowIso() }
  );
}

async function setParticipants(meetingId: number, internalUserIds: number[], external: Array<{ email: string; display_name?: string | null; contact_id?: number | null }>) {
  await run("DELETE FROM meeting_internal_participants WHERE meeting_id = @id", { id: meetingId });
  await run("DELETE FROM meeting_external_participants WHERE meeting_id = @id", { id: meetingId });
  for (const userId of internalUserIds) {
    await run("INSERT INTO meeting_internal_participants (meeting_id, user_id) VALUES (@meetingId, @userId)", {
      meetingId,
      userId
    });
  }
  for (const ext of external) {
    await run(
      `
        INSERT INTO meeting_external_participants (meeting_id, email, display_name, contact_id)
        VALUES (@meetingId, @email, @displayName, @contactId)
      `,
      {
        meetingId,
        email: ext.email.trim().toLowerCase(),
        displayName: ext.display_name ?? null,
        contactId: ext.contact_id ?? null
      }
    );
  }
}

export async function createMeeting(input: {
  client_id: number;
  product_id?: number | null;
  contact_id?: number | null;
  opportunity_id?: number | null;
  bdr_user_id: number;
  source_approach_id?: number | null;
  title: string;
  starts_at: string;
  duration_minutes: number;
  status?: MeetingStatus;
  notes?: string | null;
  internal_user_ids: number[];
  external_participants: Array<{ email: string; display_name?: string | null; contact_id?: number | null }>;
  created_by_user_id: number;
  idempotency_key?: string | null;
  skip_google?: boolean;
}) {
  if (input.idempotency_key) {
    const existing = await get<{ id: number }>("SELECT id FROM meetings WHERE idempotency_key = @key", {
      key: input.idempotency_key
    });
    if (existing) return { meetingId: existing.id, duplicate: true as const };
  }

  let opportunityId = input.opportunity_id ?? null;
  if (!opportunityId && input.product_id) {
    const { resolveOpportunityForMeeting } = await import("@/lib/opportunity-pipeline");
    opportunityId = await resolveOpportunityForMeeting({
      client_id: input.client_id,
      product_id: input.product_id,
      opportunity_id: null,
      user_id: input.created_by_user_id,
      create_if_missing: true
    });
  }

  const result = await run(
    `
      INSERT INTO meetings (
        client_id, opportunity_id, product_id, contact_id, bdr_user_id, source_approach_id,
        title, starts_at, duration_minutes, status, notes, created_by_user_id, idempotency_key,
        google_sync_status, created_at, updated_at
      ) VALUES (
        @clientId, @opportunityId, @productId, @contactId, @bdrUserId, @sourceApproachId,
        @title, @startsAt, @duration, @status, @notes, @createdBy, @idempotencyKey,
        'none', @now, @now
      )
    `,
    {
      clientId: input.client_id,
      opportunityId,
      productId: input.product_id ?? null,
      contactId: input.contact_id ?? null,
      bdrUserId: input.bdr_user_id,
      sourceApproachId: input.source_approach_id ?? null,
      title: input.title,
      startsAt: input.starts_at,
      duration: input.duration_minutes,
      status: input.status ?? "scheduled",
      notes: input.notes ?? null,
      createdBy: input.created_by_user_id,
      idempotencyKey: input.idempotency_key ?? null,
      now: nowIso()
    }
  );

  const meetingId = result.lastInsertRowid;
  if (!meetingId) throw new Error("Falha ao criar reunião");

  await setParticipants(meetingId, input.internal_user_ids, input.external_participants);
  await logStatus(meetingId, null, input.status ?? "scheduled", input.created_by_user_id);

  let google: { ok: boolean; error?: string; meet_link?: string | null } = { ok: false };
  if (!input.skip_google) {
    google = await syncMeetingToGoogle(meetingId);
  }

  return { meetingId, duplicate: false as const, google };
}

export async function updateMeeting(
  meetingId: number,
  userId: number,
  patch: {
    title?: string;
    starts_at?: string;
    duration_minutes?: number;
    status?: MeetingStatus;
    notes?: string | null;
    summary?: string | null;
    interest_notes?: string | null;
    next_step?: string | null;
    internal_user_ids?: number[];
    external_participants?: Array<{ email: string; display_name?: string | null; contact_id?: number | null }>;
    cancel_reason?: string | null;
    reschedule_reason?: string | null;
  }
) {
  const current = await get<{ status: string; starts_at: string }>("SELECT status, starts_at FROM meetings WHERE id = @id", {
    id: meetingId
  });
  if (!current) throw new Error("Reunião não encontrada");

  const isReschedule = patch.starts_at && patch.starts_at !== current.starts_at;
  if (isReschedule && patch.starts_at) {
    await run(
      `
        UPDATE meetings SET
          previous_starts_at = starts_at,
          rescheduled_at = @now,
          rescheduled_by_user_id = @userId,
          reschedule_reason = @reason,
          starts_at = @startsAt,
          status = 'scheduled',
          updated_at = @now
        WHERE id = @id
      `,
      {
        id: meetingId,
        startsAt: patch.starts_at,
        userId,
        reason: patch.reschedule_reason ?? null,
        now: nowIso()
      }
    );
    await logStatus(meetingId, current.status, "scheduled", userId, patch.reschedule_reason ?? "Reagendado");
  }

  if (patch.status === "cancelled") {
    await run(
      `
        UPDATE meetings SET status = 'cancelled', cancelled_at = @now, cancelled_by_user_id = @userId,
          cancel_reason = @reason, updated_at = @now
        WHERE id = @id
      `,
      { id: meetingId, userId, reason: patch.cancel_reason ?? null, now: nowIso() }
    );
    await logStatus(meetingId, current.status, "cancelled", userId, patch.cancel_reason);
    await cancelMeetingOnGoogle(meetingId);
    return;
  }

  await run(
    `
      UPDATE meetings SET
        title = COALESCE(@title, title),
        duration_minutes = COALESCE(@duration, duration_minutes),
        status = COALESCE(@status, status),
        notes = COALESCE(@notes, notes),
        summary = COALESCE(@summary, summary),
        interest_notes = COALESCE(@interestNotes, interest_notes),
        next_step = COALESCE(@nextStep, next_step),
        updated_at = @now
      WHERE id = @id
    `,
    {
      id: meetingId,
      title: patch.title ?? null,
      duration: patch.duration_minutes ?? null,
      status: patch.status ?? null,
      notes: patch.notes === undefined ? null : patch.notes,
      summary: patch.summary === undefined ? null : patch.summary,
      interestNotes: patch.interest_notes === undefined ? null : patch.interest_notes,
      nextStep: patch.next_step === undefined ? null : patch.next_step,
      now: nowIso()
    }
  );

  if (patch.status && patch.status !== current.status && !isReschedule) {
    await logStatus(meetingId, current.status, patch.status, userId);
  }

  if (patch.internal_user_ids) {
    const external =
      patch.external_participants ??
      (await all<{ email: string; display_name: string | null; contact_id: number | null }>(
        "SELECT email, display_name, contact_id FROM meeting_external_participants WHERE meeting_id = @id",
        { id: meetingId }
      ));
    await setParticipants(meetingId, patch.internal_user_ids, external);
  } else if (patch.external_participants) {
    const internal = await all<{ user_id: number }>(
      "SELECT user_id FROM meeting_internal_participants WHERE meeting_id = @id",
      { id: meetingId }
    );
    await setParticipants(
      meetingId,
      internal.map((i) => i.user_id),
      patch.external_participants
    );
  }

  await syncMeetingToGoogle(meetingId);
}

export async function getMeetingDetail(id: number) {
  const meeting = await get<Record<string, unknown>>("SELECT * FROM meetings WHERE id = @id", { id });
  if (!meeting) return null;
  const internal = await all<{ id: number; name: string; email: string }>(
    `
      SELECT u.id, u.name, u.email FROM meeting_internal_participants mip
      JOIN users u ON u.id = mip.user_id WHERE mip.meeting_id = @id
    `,
    { id }
  );
  const external = await all(
    "SELECT id, email, display_name, contact_id FROM meeting_external_participants WHERE meeting_id = @id",
    { id }
  );
  return { meeting, internal_participants: internal, external_participants: external };
}

export async function listMeetings(filters: {
  scope?: "all" | "mine";
  user_id?: number;
  bdr_user_id?: number;
  product_id?: number;
  status?: string;
  participant_user_id?: number;
  from?: string | null;
  to?: string | null;
}) {
  const where: string[] = ["1=1"];
  const params: Record<string, string | number> = {};

  if (filters.scope === "mine" && filters.user_id) {
    where.push(`(
      m.bdr_user_id = @userId OR EXISTS (
        SELECT 1 FROM meeting_internal_participants mip
        WHERE mip.meeting_id = m.id AND mip.user_id = @userId
      )
    )`);
    params.userId = filters.user_id;
  }
  if (filters.bdr_user_id) {
    where.push("m.bdr_user_id = @bdrUserId");
    params.bdrUserId = filters.bdr_user_id;
  }
  if (filters.product_id) {
    where.push("m.product_id = @productId");
    params.productId = filters.product_id;
  }
  if (filters.status) {
    where.push("m.status = @status");
    params.status = filters.status;
  }
  if (filters.participant_user_id) {
    where.push(`EXISTS (SELECT 1 FROM meeting_internal_participants mip WHERE mip.meeting_id = m.id AND mip.user_id = @participantId)`);
    params.participantId = filters.participant_user_id;
  }
  if (filters.from) {
    where.push("m.starts_at >= @from");
    params.from = filters.from;
  }
  if (filters.to) {
    where.push("m.starts_at <= @to");
    params.to = filters.to;
  }

  return all<{
    id: number;
    title: string;
    starts_at: string;
    duration_minutes: number;
    status: string;
    meet_link: string | null;
    google_sync_status: string;
    google_sync_error: string | null;
    client_id: number;
    client_name: string;
    product_name: string | null;
    contact_name: string | null;
    bdr_name: string;
  }>(
    `
      SELECT m.id, m.title, m.starts_at, m.duration_minutes, m.status, m.meet_link,
        m.google_sync_status, m.google_sync_error,
        m.client_id,
        COALESCE(c.trade_name, c.legal_name, 'Cliente') AS client_name,
        p.name AS product_name,
        ct.name AS contact_name,
        u.name AS bdr_name
      FROM meetings m
      JOIN clients c ON c.id = m.client_id
      JOIN users u ON u.id = m.bdr_user_id
      LEFT JOIN products p ON p.id = m.product_id
      LEFT JOIN contacts ct ON ct.id = m.contact_id
      WHERE ${where.join(" AND ")}
      ORDER BY m.starts_at ASC
      LIMIT 300
    `,
    params
  );
}

export async function createMeetingFromApproach(input: {
  client_id: number;
  product_id?: number | null;
  contact_id?: number | null;
  bdr_user_id: number;
  source_approach_id: number;
  starts_at: string;
  notes?: string | null;
  created_by_user_id: number;
}) {
  const client = await get<{ trade_name: string | null; legal_name: string | null }>(
    "SELECT trade_name, legal_name FROM clients WHERE id = @id",
    { id: input.client_id }
  );
  const name = client?.trade_name || client?.legal_name || "Cliente";
  const internal = await suggestInternalParticipants(input.product_id ?? null, input.bdr_user_id);
  const contact = input.contact_id
    ? await get<{ email: string | null; name: string }>("SELECT email, name FROM contacts WHERE id = @id", {
        id: input.contact_id
      })
    : null;
  const external = contact?.email
    ? [{ email: contact.email, display_name: contact.name, contact_id: input.contact_id }]
    : [];

  return createMeeting({
    client_id: input.client_id,
    product_id: input.product_id,
    contact_id: input.contact_id,
    bdr_user_id: input.bdr_user_id,
    source_approach_id: input.source_approach_id,
    title: `Reunião — ${name}`,
    starts_at: input.starts_at,
    duration_minutes: 30,
    notes: input.notes,
    internal_user_ids: internal.map((u) => u.id),
    external_participants: external,
    created_by_user_id: input.created_by_user_id,
    idempotency_key: `approach-${input.source_approach_id}`
  });
}
