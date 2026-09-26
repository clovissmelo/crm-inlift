import { get, all, nowIso, run } from "@/lib/db";
import { api4comStartCall } from "@/lib/api4com/client";
import { getApi4comConfig } from "@/lib/api4com/config";
import { resolveApi4comApiTokenForUser } from "@/lib/api4com/user-token";
import { normalizeApi4comCalledNumber, normalizeApi4comExtension } from "@/lib/api4com/phone";

export type Api4comCallRow = {
  id: number;
  api4com_call_id: string | null;
  user_id: number;
  client_id: number | null;
  contact_id: number | null;
  product_id: number | null;
  phone_dialed: string;
  extension: string;
  status: string;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  hangup_cause_code: string | null;
  hangup_cause_label: string | null;
  record_url: string | null;
  direction: string | null;
  approach_id: number | null;
  result_pending: boolean;
  result_deferred_at: string | null;
  error_message: string | null;
  created_at: string;
};

export async function assertExtensionUnique(extension: string, excludeUserId?: number) {
  const row = await get<{ id: number }>(
    `
      SELECT id FROM users
      WHERE api4com_extension = @extension AND status = 'active'
        ${excludeUserId ? "AND id <> @excludeUserId" : ""}
      LIMIT 1
    `,
    { extension, excludeUserId: excludeUserId ?? null }
  );
  if (row) throw new Error("Este ramal já está em uso por outra BDR ativa.");
}

export async function getUserExtension(userId: number) {
  const row = await get<{ api4com_extension: string | null; status: string }>(
    "SELECT api4com_extension, status FROM users WHERE id = @id",
    { id: userId }
  );
  if (!row || row.status !== "active") return null;
  return normalizeApi4comExtension(row.api4com_extension ?? "");
}

export async function findRecentDuplicateCall(userId: number, clientId: number | null, phone: string, withinMs = 25_000) {
  const since = new Date(Date.now() - withinMs).toISOString();
  return get<{ id: number }>(
    `
      SELECT id FROM api4com_calls
      WHERE user_id = @userId
        AND phone_dialed = @phone
        AND client_id IS NOT DISTINCT FROM @clientId
        AND status IN ('initiating', 'ringing', 'in_progress')
        AND created_at >= @since
      ORDER BY id DESC LIMIT 1
    `,
    { userId, clientId, phone, since }
  );
}

export async function initiateApi4comCall(input: {
  userId: number;
  clientId?: number | null;
  contactId?: number | null;
  productId?: number | null;
  phone: string;
}) {
  const extension = await getUserExtension(input.userId);
  if (!extension) {
    throw new Error("Configure seu ramal API4COM no perfil antes de ligar.");
  }

  const called = normalizeApi4comCalledNumber(input.phone);
  if (!called) throw new Error("Número de telefone inválido para discagem.");

  const dup = await findRecentDuplicateCall(input.userId, input.clientId ?? null, called);
  if (dup) throw new Error("Já existe uma chamada em andamento para este número. Aguarde alguns segundos.");

  const cfg = await getApi4comConfig();
  const now = nowIso();

  const insert = await run(
    `
      INSERT INTO api4com_calls (
        user_id, client_id, contact_id, product_id, phone_dialed, extension,
        status, created_at, updated_at
      ) VALUES (
        @userId, @clientId, @contactId, @productId, @phone, @extension,
        'initiating', @now, @now
      )
    `,
    {
      userId: input.userId,
      clientId: input.clientId ?? null,
      contactId: input.contactId ?? null,
      productId: input.productId ?? null,
      phone: called,
      extension,
      now
    }
  );

  const callRecordId = insert.lastInsertRowid as number;
  const metadata: Record<string, string> = {
    gateway: cfg.gateway,
    crm: "inlift",
    user_id: String(input.userId),
    call_record_id: String(callRecordId)
  };
  if (input.clientId) metadata.client_id = String(input.clientId);
  if (input.contactId) metadata.contact_id = String(input.contactId);
  if (input.productId) metadata.product_id = String(input.productId);

  const apiToken = await resolveApi4comApiTokenForUser(input.userId);
  if (!apiToken) {
    throw new Error(
      "Token API4COM não configurado. BDR: cadastre em Meu perfil; admin: Variáveis ou cadastro do usuário."
    );
  }

  try {
    const apiRes = await api4comStartCall(
      {
        caller: extension,
        called,
        extension,
        metadata
      },
      apiToken
    );

    await run(
      `
        UPDATE api4com_calls SET
          api4com_call_id = @apiId,
          status = 'ringing',
          started_at = COALESCE(started_at, @now),
          metadata_json = @meta,
          updated_at = @now
        WHERE id = @id
      `,
      {
        id: callRecordId,
        apiId: apiRes.id ?? null,
        meta: JSON.stringify(metadata),
        now: nowIso()
      }
    );

    return { call_record_id: callRecordId, api4com_call_id: apiRes.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao discar";
    await run(
      `
        UPDATE api4com_calls SET status = 'failed', error_message = @message, updated_at = @now
        WHERE id = @id
      `,
      { id: callRecordId, message, now: nowIso() }
    );
    throw err;
  }
}

export async function getCallById(id: number) {
  return get<Api4comCallRow>("SELECT * FROM api4com_calls WHERE id = @id", { id });
}

export async function getCallDetailForUser(id: number, userId: number) {
  return get<
    Api4comCallRow & {
      client_name: string | null;
      contact_name: string | null;
      product_name: string | null;
    }
  >(
    `
      SELECT c.*,
        COALESCE(cl.trade_name, cl.legal_name) AS client_name,
        ct.name AS contact_name,
        p.name AS product_name
      FROM api4com_calls c
      LEFT JOIN clients cl ON cl.id = c.client_id
      LEFT JOIN contacts ct ON ct.id = c.contact_id
      LEFT JOIN products p ON p.id = c.product_id
      WHERE c.id = @id AND c.user_id = @userId
    `,
    { id, userId }
  );
}

export async function listPendingCallsForUser(userId: number) {
  return all<
    Api4comCallRow & {
      client_name: string | null;
      contact_name: string | null;
    }
  >(
    `
      SELECT c.*,
        COALESCE(cl.trade_name, cl.legal_name) AS client_name,
        ct.name AS contact_name
      FROM api4com_calls c
      LEFT JOIN clients cl ON cl.id = c.client_id
      LEFT JOIN contacts ct ON ct.id = c.contact_id
      WHERE c.user_id = @userId
        AND c.result_pending = true
        AND c.approach_id IS NULL
        AND c.status = 'completed'
      ORDER BY c.ended_at DESC NULLS LAST, c.id DESC
      LIMIT 20
    `,
    { userId }
  );
}

export async function deferCallResult(callId: number, userId: number) {
  const row = await getCallById(callId);
  if (!row || row.user_id !== userId) throw new Error("Chamada não encontrada");
  await run(
    `
      UPDATE api4com_calls SET result_deferred_at = @now, updated_at = @now
      WHERE id = @id
    `,
    { id: callId, now: nowIso() }
  );
}

export async function linkCallToApproach(callId: number, userId: number, approachId: number) {
  const row = await getCallById(callId);
  if (!row || row.user_id !== userId) throw new Error("Chamada não encontrada");
  await run(
    `
      UPDATE api4com_calls SET
        approach_id = @approachId,
        result_pending = false,
        updated_at = @now
      WHERE id = @id
    `,
    { id: callId, approachId, now: nowIso() }
  );
}

export type Api4comWebhookPayload = {
  version?: string;
  eventType?: string;
  id?: string;
  domain?: string;
  direction?: string;
  caller?: string;
  called?: string;
  startedAt?: string;
  answeredAt?: string;
  endedAt?: string;
  hangupCauseCode?: string | number;
  hangupCause?: string;
  recordUrl?: string;
  metadata?: Record<string, unknown>;
};

function parseIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function durationSeconds(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const sec = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  return sec >= 0 ? sec : null;
}

export async function processApi4comWebhook(payload: Api4comWebhookPayload, webhookEventId: string) {
  const existing = await get<{ id: number }>(
    "SELECT id FROM api4com_calls WHERE webhook_event_id = @eventId LIMIT 1",
    { eventId: webhookEventId }
  );
  if (existing) return { ok: true, duplicate: true, call_id: existing.id };

  const cfg = await getApi4comConfig();
  const meta = payload.metadata ?? {};
  const metaGateway = typeof meta.gateway === "string" ? meta.gateway : null;
  if (metaGateway && metaGateway !== cfg.gateway) {
    return { ok: false, reason: "gateway_mismatch" };
  }

  const callRecordIdRaw = meta.call_record_id;
  const callRecordId = callRecordIdRaw != null ? Number(callRecordIdRaw) : NaN;

  let callRow = !Number.isNaN(callRecordId)
    ? await getCallById(callRecordId)
    : null;

  if (!callRow && payload.id) {
    callRow = await get<Api4comCallRow>("SELECT * FROM api4com_calls WHERE api4com_call_id = @apiId LIMIT 1", {
      apiId: payload.id
    });
  }

  const eventType = payload.eventType ?? "";
  const isHangup = eventType === "channel-hangup" || eventType.includes("hangup");
  const isAnswer = eventType === "channel-answer" || eventType.includes("answer");

  if (!callRow) {
    if (!isHangup && !isAnswer) return { ok: true, ignored: true };
    const clientIdRaw = meta.client_id;
    const clientId = clientIdRaw != null ? Number(clientIdRaw) : null;
    if (!clientId || Number.isNaN(clientId)) {
      return { ok: true, ignored: true, reason: "unmatched_external_call" };
    }
    const userIdRaw = meta.user_id;
    const userId = userIdRaw != null ? Number(userIdRaw) : null;
    if (!userId || Number.isNaN(userId)) {
      return { ok: true, ignored: true, reason: "unmatched_external_call" };
    }
    const now = nowIso();
    const insert = await run(
      `
        INSERT INTO api4com_calls (
          api4com_call_id, user_id, client_id, contact_id, product_id,
          phone_dialed, extension, status, started_at, answered_at, ended_at,
          duration_seconds, hangup_cause_code, record_url, direction,
          metadata_json, webhook_event_id, result_pending, created_at, updated_at
        ) VALUES (
          @apiId, @userId, @clientId, @contactId, @productId,
          @phone, @extension, 'completed', @started, @answered, @ended,
          @duration, @hangupCode, @recordUrl, @direction,
          @meta, @eventId, true, @now, @now
        )
      `,
      {
        apiId: payload.id ?? null,
        userId,
        clientId,
        contactId: meta.contact_id ? Number(meta.contact_id) : null,
        productId: meta.product_id ? Number(meta.product_id) : null,
        phone: String(payload.called ?? ""),
        extension: String(payload.caller ?? ""),
        started: parseIso(payload.startedAt),
        answered: parseIso(payload.answeredAt),
        ended: parseIso(payload.endedAt),
        duration: durationSeconds(parseIso(payload.startedAt), parseIso(payload.endedAt)),
        hangupCode: payload.hangupCauseCode != null ? String(payload.hangupCauseCode) : null,
        recordUrl: payload.recordUrl ?? null,
        direction: payload.direction ?? null,
        meta: JSON.stringify(payload),
        eventId: webhookEventId,
        now
      }
    );
    return { ok: true, call_id: insert.lastInsertRowid, created: true };
  }

  const started = parseIso(payload.startedAt) ?? callRow.started_at;
  const answered = parseIso(payload.answeredAt) ?? callRow.answered_at;
  const ended = parseIso(payload.endedAt) ?? callRow.ended_at;

  let status = callRow.status;
  if (isAnswer) status = "in_progress";
  if (isHangup) status = "completed";

  const resultPending = isHangup && !callRow.approach_id;

  await run(
    `
      UPDATE api4com_calls SET
        api4com_call_id = COALESCE(@apiId, api4com_call_id),
        status = @status,
        started_at = COALESCE(@started, started_at),
        answered_at = COALESCE(@answered, answered_at),
        ended_at = COALESCE(@ended, ended_at),
        duration_seconds = COALESCE(@duration, duration_seconds),
        hangup_cause_code = COALESCE(@hangupCode, hangup_cause_code),
        hangup_cause_label = COALESCE(@hangupLabel, hangup_cause_label),
        record_url = COALESCE(@recordUrl, record_url),
        direction = COALESCE(@direction, direction),
        metadata_json = COALESCE(@metaJson, metadata_json),
        webhook_event_id = COALESCE(webhook_event_id, @eventId),
        result_pending = CASE WHEN @resultPending THEN true ELSE result_pending END,
        updated_at = @now
      WHERE id = @id
    `,
    {
      id: callRow.id,
      apiId: payload.id ?? null,
      status,
      started,
      answered,
      ended,
      duration: durationSeconds(started, ended),
      hangupCode: payload.hangupCauseCode != null ? String(payload.hangupCauseCode) : null,
      hangupLabel: payload.hangupCause ?? null,
      recordUrl: payload.recordUrl ?? null,
      direction: payload.direction ?? null,
      metaJson: JSON.stringify(payload),
      eventId: webhookEventId,
      resultPending,
      now: nowIso()
    }
  );

  return { ok: true, call_id: callRow.id, completed: isHangup };
}
