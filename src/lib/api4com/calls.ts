import { get, all, nowIso, run } from "@/lib/db";
import { api4comHangupCall, api4comStartCall } from "@/lib/api4com/client";
import { WARM_SCREEN_PURPOSE } from "@/lib/warm-screen/constants";
import {
  callIsWarmScreenCall,
  mergeApi4comWebhookMetadata,
  metadataIndicatesWarmScreen
} from "@/lib/warm-screen/call-marker";
import { getApi4comConfig } from "@/lib/api4com/config";
import { resolveApi4comApiTokenForUser } from "@/lib/api4com/user-token";
import { API4COM_NO_EXTENSION_MESSAGE } from "@/lib/api4com/dial-identity-shared";
import { assertApi4comExtensionLinkedToToken } from "@/lib/api4com/extension-account";
import { normalizeApi4comCalledNumber, normalizeApi4comExtension, toApi4comCalledE164 } from "@/lib/api4com/phone";
import { normalizeCallScriptLog, type CallScriptLogEntry } from "@/lib/call-script-log";

/** initiating/ringing sem webhook há mais que isso → falha automática */
export const API4COM_STALE_RINGING_MS = 20 * 60 * 1000;
/** in_progress sem atualização há mais que isso → falha automática */
export const API4COM_STALE_IN_PROGRESS_MS = 3 * 60 * 60 * 1000;

export const API4COM_STALE_FAIL_MESSAGE =
  "Encerrada automaticamente — ligação expirou no CRM (telefonia ou tela não finalizou).";

function staleRingingCutoffIso() {
  return new Date(Date.now() - API4COM_STALE_RINGING_MS).toISOString();
}

function staleInProgressCutoffIso() {
  return new Date(Date.now() - API4COM_STALE_IN_PROGRESS_MS).toISOString();
}

function activeCallTimeParams() {
  return {
    ringingSince: staleRingingCutoffIso(),
    inProgressSince: staleInProgressCutoffIso()
  };
}

/** Ligações do motor de aquecimento não usam painel de roteiro (só discagem manual). */
const SQL_IS_WARM_SCREEN_CALL = `
  (
    COALESCE(c.metadata_json::jsonb ->> 'purpose', '') = @warmScreenPurpose
    OR COALESCE(c.metadata_json::jsonb -> 'metadata' ->> 'purpose', '') = @warmScreenPurpose
    OR EXISTS (
      SELECT 1 FROM warm_screen_execution_items wi
      WHERE wi.api4com_call_row_id = c.id
    )
    OR EXISTS (
      SELECT 1 FROM warm_screen_execution_items wi
      INNER JOIN warm_screen_executions we ON we.id = wi.execution_id
      WHERE we.status IN ('running', 'paused')
        AND wi.status = 'dialing'
        AND wi.client_id = c.client_id
        AND (
          wi.api4com_call_row_id = c.id
          OR (
            wi.api4com_call_row_id IS NULL
            AND wi.phone_dialed IS NOT NULL
            AND wi.phone_dialed = c.phone_dialed
          )
        )
    )
  )
`;

const SQL_EXCLUDE_WARM_SCREEN_CALLS = `
  AND NOT ${SQL_IS_WARM_SCREEN_CALL}
`;

/** Marca ligações presas em initiating/ringing/in_progress como failed (evita bloqueio permanente). */
export async function expireStaleApi4comCalls(scope?: {
  userId?: number;
  clientId?: number;
}): Promise<void> {
  const ringingBefore = staleRingingCutoffIso();
  const inProgressBefore = staleInProgressCutoffIso();
  const now = nowIso();

  let scopeClause = "";
  if (scope?.userId != null && scope?.clientId != null) {
    scopeClause = "AND (user_id = @userId OR client_id = @clientId)";
  } else if (scope?.userId != null) {
    scopeClause = "AND user_id = @userId";
  } else if (scope?.clientId != null) {
    scopeClause = "AND client_id = @clientId";
  }

  await run(
    `
      UPDATE api4com_calls
      SET status = 'failed',
          error_message = @message,
          result_pending = false,
          ended_at = COALESCE(ended_at, @now),
          updated_at = @now
      WHERE status IN ('initiating', 'ringing', 'in_progress')
        AND (
          (status IN ('initiating', 'ringing') AND updated_at < @ringingBefore)
          OR (status = 'in_progress' AND updated_at < @inProgressBefore)
        )
        ${scopeClause}
    `,
    {
      message: API4COM_STALE_FAIL_MESSAGE,
      now,
      ringingBefore,
      inProgressBefore,
      userId: scope?.userId ?? null,
      clientId: scope?.clientId ?? null
    }
  );
}

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
  dial_session_root_id: number | null;
  metadata_json: string | null;
  script_flow_log?: unknown;
  created_at: string;
};

export async function appendCallScriptLog(callId: number, userId: number, entry: Omit<CallScriptLogEntry, "at">) {
  const row = await get<{ script_flow_log: unknown; status: string }>(
    `
      SELECT script_flow_log, status FROM api4com_calls
      WHERE id = @id AND user_id = @userId
    `,
    { callId, userId }
  );
  if (!row) throw new Error("Chamada não encontrada");
  if (!["initiating", "ringing", "in_progress"].includes(row.status)) {
    throw new Error("O roteiro só pode ser atualizado enquanto a ligação estiver ativa.");
  }
  const prev = normalizeCallScriptLog(row.script_flow_log);
  const { enrichScriptLogEntryWithContactCreate } = await import("@/lib/script-flow-capture-contact");
  const enriched = await enrichScriptLogEntryWithContactCreate(callId, entry, prev);
  const next: CallScriptLogEntry[] = [
    ...prev,
    {
      ...enriched,
      at: nowIso()
    }
  ];
  await run(
    `
      UPDATE api4com_calls SET script_flow_log = @log::jsonb, updated_at = @now
      WHERE id = @id AND user_id = @userId
    `,
    { id: callId, userId, log: JSON.stringify(next), now: nowIso() }
  );
  return next;
}

export async function replaceCallScriptLog(callId: number, userId: number, log: CallScriptLogEntry[]) {
  const row = await get<{ status: string }>(
    `
      SELECT status FROM api4com_calls
      WHERE id = @id AND user_id = @userId
    `,
    { callId, userId }
  );
  if (!row) throw new Error("Chamada não encontrada");
  if (!["initiating", "ringing", "in_progress"].includes(row.status)) {
    throw new Error("O roteiro só pode ser atualizado enquanto a ligação estiver ativa.");
  }
  const normalized = normalizeCallScriptLog(log);
  await run(
    `
      UPDATE api4com_calls SET script_flow_log = @log::jsonb, updated_at = @now
      WHERE id = @id AND user_id = @userId
    `,
    { id: callId, userId, log: JSON.stringify(normalized), now: nowIso() }
  );
  return normalized;
}

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
  const { ringingSince, inProgressSince } = activeCallTimeParams();
  return get<{ id: number }>(
    `
      SELECT id FROM api4com_calls
      WHERE user_id = @userId
        AND phone_dialed = @phone
        AND client_id IS NOT DISTINCT FROM @clientId
        AND status IN ('initiating', 'ringing', 'in_progress')
        AND created_at >= @since
        AND (
          (status = 'in_progress' AND updated_at >= @inProgressSince)
          OR (status IN ('initiating', 'ringing') AND updated_at >= @ringingSince)
        )
      ORDER BY id DESC LIMIT 1
    `,
    { userId, clientId, phone, since, ringingSince, inProgressSince }
  );
}

export async function initiateApi4comCall(input: {
  userId: number;
  /** Ramal/token API4COM (padrão: o próprio usuário). Admin pode informar outro usuário para testes. */
  dialIdentityUserId?: number;
  clientId?: number | null;
  contactId?: number | null;
  productId?: number | null;
  phone: string;
  dialSessionRootId?: number | null;
  warmScreen?: { executionId: number; itemId: number };
}) {
  const dialIdentityUserId = input.dialIdentityUserId ?? input.userId;
  const extension = await getUserExtension(dialIdentityUserId);
  if (!extension) {
    if (dialIdentityUserId === input.userId) {
      throw new Error(API4COM_NO_EXTENSION_MESSAGE);
    }
    throw new Error("O usuário selecionado não possui ramal configurado.");
  }

  const called = normalizeApi4comCalledNumber(input.phone);
  if (!called) throw new Error("Número de telefone inválido para discagem.");

  await expireStaleApi4comCalls({
    userId: input.userId,
    clientId: input.clientId ?? undefined
  });

  const dup = await findRecentDuplicateCall(input.userId, input.clientId ?? null, called);
  if (dup) throw new Error("Já existe uma chamada em andamento para este número. Aguarde alguns segundos.");

  if (input.clientId) {
    const { ringingSince, inProgressSince } = activeCallTimeParams();
    const clientBusy = await get<{ id: number }>(
      `
        SELECT id FROM api4com_calls
        WHERE client_id = @clientId
          AND status IN ('initiating', 'ringing', 'in_progress')
          AND (
            (status = 'in_progress' AND updated_at >= @inProgressSince)
            OR (status IN ('initiating', 'ringing') AND updated_at >= @ringingSince)
          )
        ORDER BY id DESC LIMIT 1
      `,
      { clientId: input.clientId, ringingSince, inProgressSince }
    );
    if (clientBusy) {
      throw new Error("Já existe uma ligação em andamento para este cliente. Aguarde o encerramento.");
    }
  }

  const cfg = await getApi4comConfig();
  const now = nowIso();

  const insertMeta: Record<string, string> | null = input.warmScreen
    ? {
        purpose: WARM_SCREEN_PURPOSE,
        warm_screen_execution_id: String(input.warmScreen.executionId),
        warm_screen_item_id: String(input.warmScreen.itemId),
        gateway: cfg.gateway,
        crm: "inlift",
        user_id: String(input.userId)
      }
    : null;

  const insert = await run(
    `
      INSERT INTO api4com_calls (
        user_id, client_id, contact_id, product_id, phone_dialed, extension,
        dial_session_root_id, status, metadata_json, created_at, updated_at
      ) VALUES (
        @userId, @clientId, @contactId, @productId, @phone, @extension,
        @dialSessionRootId, 'initiating', @insertMeta::jsonb, @now, @now
      )
    `,
    {
      userId: input.userId,
      clientId: input.clientId ?? null,
      contactId: input.contactId ?? null,
      productId: input.productId ?? null,
      phone: called,
      extension,
      dialSessionRootId: input.dialSessionRootId ?? null,
      insertMeta: insertMeta ? JSON.stringify(insertMeta) : null,
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
  if (dialIdentityUserId !== input.userId) {
    metadata.dial_identity_user_id = String(dialIdentityUserId);
  }
  if (input.warmScreen) {
    metadata.purpose = WARM_SCREEN_PURPOSE;
    metadata.warm_screen_execution_id = String(input.warmScreen.executionId);
    metadata.warm_screen_item_id = String(input.warmScreen.itemId);
  }

  const apiToken = await resolveApi4comApiTokenForUser(dialIdentityUserId);
  if (!apiToken) {
    throw new Error(
      "Token API4COM não configurado. BDR: cadastre em Meu perfil; admin: Variáveis ou cadastro do usuário."
    );
  }

  await assertApi4comExtensionLinkedToToken(apiToken, extension);

  const calledForApi = toApi4comCalledE164(called);

  try {
    const apiRes = await api4comStartCall(
      {
        caller: extension,
        called: calledForApi,
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
        p.name AS product_name,
        tr.display_name AS technical_display_name,
        tr.slug AS technical_slug
      FROM api4com_calls c
      LEFT JOIN clients cl ON cl.id = c.client_id
      LEFT JOIN contacts ct ON ct.id = c.contact_id
      LEFT JOIN products p ON p.id = c.product_id
      LEFT JOIN call_technical_result_types tr ON tr.id = c.technical_result_type_id
      WHERE c.id = @id AND c.user_id = @userId
    `,
    { id, userId }
  );
}

export async function listActiveCallsForUser(userId: number) {
  await expireStaleApi4comCalls({ userId });
  const rows = await all<
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
      WHERE c.user_id = @userId
        AND c.ended_at IS NULL
        AND (
          (c.status = 'in_progress' AND c.updated_at >= @inProgressSince)
          OR (c.status IN ('initiating', 'ringing') AND c.updated_at >= @ringingSince)
        )
        ${SQL_EXCLUDE_WARM_SCREEN_CALLS}
      ORDER BY c.id DESC
      LIMIT 1
    `,
    { userId, warmScreenPurpose: WARM_SCREEN_PURPOSE, ...activeCallTimeParams() }
  );

  const manual: typeof rows = [];
  for (const row of rows) {
    if (await callIsWarmScreenCall(row.id, row.metadata_json)) continue;
    manual.push(row);
  }
  return manual;
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
        ${SQL_EXCLUDE_WARM_SCREEN_CALLS}
        AND c.id = (
          SELECT c2.id FROM api4com_calls c2
          WHERE c2.user_id = @userId
            AND c2.result_pending = true
            AND c2.approach_id IS NULL
            AND c2.status = 'completed'
            AND NOT (
              COALESCE(c2.metadata_json::jsonb ->> 'purpose', '') = @warmScreenPurpose
              OR COALESCE(c2.metadata_json::jsonb -> 'metadata' ->> 'purpose', '') = @warmScreenPurpose
              OR EXISTS (
                SELECT 1 FROM warm_screen_execution_items wi
                WHERE wi.api4com_call_row_id = c2.id
              )
            )
            AND COALESCE(c2.dial_session_root_id, c2.id) = COALESCE(c.dial_session_root_id, c.id)
          ORDER BY c2.ended_at DESC NULLS LAST, c2.id DESC
          LIMIT 1
        )
      ORDER BY c.ended_at DESC NULLS LAST, c.id DESC
      LIMIT 20
    `,
    { userId, warmScreenPurpose: WARM_SCREEN_PURPOSE }
  );
}

export async function dismissPendingCallResult(callId: number, userId: number) {
  const row = await getCallById(callId);
  if (!row || row.user_id !== userId) throw new Error("Chamada não encontrada");
  if (!row.result_pending) return;
  try {
    const sessionRoot = row.dial_session_root_id ?? row.id;
    await run(
      `
        UPDATE api4com_calls SET result_pending = false, updated_at = @now
        WHERE user_id = @userId
          AND COALESCE(dial_session_root_id, id) = @sessionRoot
          AND approach_id IS NULL
      `,
      { userId, sessionRoot, now: nowIso() }
    );
  } catch {
    await run(
      `
        UPDATE api4com_calls SET result_pending = false, updated_at = @now
        WHERE id = @id AND user_id = @userId
      `,
      { id: callId, userId, now: nowIso() }
    );
  }
}

export async function deferCallResult(callId: number, userId: number) {
  const row = await getCallById(callId);
  if (!row || row.user_id !== userId) throw new Error("Chamada não encontrada");
  const sessionRoot = row.dial_session_root_id ?? row.id;
  await run(
    `
      UPDATE api4com_calls SET result_deferred_at = @now, updated_at = @now
      WHERE user_id = @userId
        AND COALESCE(dial_session_root_id, id) = @sessionRoot
        AND result_pending = true
        AND approach_id IS NULL
    `,
    { userId, sessionRoot, now: nowIso() }
  );
}

export async function linkCallToApproach(callId: number, userId: number, approachId: number) {
  const row = await getCallById(callId);
  if (!row || row.user_id !== userId) throw new Error("Chamada não encontrada");
  const sessionRoot = row.dial_session_root_id ?? row.id;
  const now = nowIso();
  try {
    await run(
      `
        UPDATE api4com_calls SET
          approach_id = @approachId,
          result_pending = false,
          updated_at = @now
        WHERE user_id = @userId
          AND COALESCE(dial_session_root_id, id) = @sessionRoot
          AND approach_id IS NULL
      `,
      { userId, sessionRoot, approachId, now }
    );
  } catch {
    await run(
      `
        UPDATE api4com_calls SET
          approach_id = @approachId,
          result_pending = false,
          updated_at = @now
        WHERE id = @id AND user_id = @userId
      `,
      { id: callId, userId, approachId, now }
    );
  }
}

export async function ensureDialSessionRoot(callId: number) {
  await run(
    `
      UPDATE api4com_calls SET
        dial_session_root_id = COALESCE(dial_session_root_id, id),
        updated_at = @now
      WHERE id = @id
    `,
    { id: callId, now: nowIso() }
  );
}

export async function clearPendingOnSiblingCalls(callId: number) {
  const row = await getCallById(callId);
  if (!row) return;
  const sessionRoot = row.dial_session_root_id ?? row.id;
  await run(
    `
      UPDATE api4com_calls SET result_pending = false, updated_at = @now
      WHERE COALESCE(dial_session_root_id, id) = @sessionRoot
        AND id <> @callId
        AND approach_id IS NULL
        AND status = 'completed'
    `,
    { sessionRoot, callId, now: nowIso() }
  );
}

export async function recordDialSkip(input: {
  sessionRootId: number;
  userId: number;
  clientId: number;
  contactId?: number | null;
  phone: string;
}) {
  const called = normalizeApi4comCalledNumber(input.phone);
  if (!called) throw new Error("Telefone inválido");
  await run(
    `
      INSERT INTO api4com_dial_skips (
        dial_session_root_id, user_id, client_id, contact_id, phone, created_at
      ) VALUES (
        @sessionRootId, @userId, @clientId, @contactId, @phone, @now
      )
    `,
    {
      sessionRootId: input.sessionRootId,
      userId: input.userId,
      clientId: input.clientId,
      contactId: input.contactId ?? null,
      phone: called,
      now: nowIso()
    }
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

  if (!callRow && payload.caller && payload.called) {
    const calledNorm = normalizeApi4comCalledNumber(String(payload.called));
    const ext = normalizeApi4comExtension(String(payload.caller));
    if (calledNorm && ext) {
      const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      callRow = await get<Api4comCallRow>(
        `
          SELECT * FROM api4com_calls
          WHERE phone_dialed = @phone AND extension = @ext
            AND status IN ('initiating', 'ringing', 'in_progress')
            AND created_at >= @since
          ORDER BY id DESC LIMIT 1
        `,
        { phone: calledNorm, ext, since }
      );
    }
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
      const { persistCallTechnicalResult } = await import("@/lib/api4com/persist-technical-result");
    if (insert.lastInsertRowid) await persistCallTechnicalResult(Number(insert.lastInsertRowid));
    return { ok: true, call_id: insert.lastInsertRowid, created: true };
  }

  const started = parseIso(payload.startedAt) ?? callRow.started_at;
  const answered = parseIso(payload.answeredAt) ?? callRow.answered_at;
  const ended = parseIso(payload.endedAt) ?? callRow.ended_at;

  let status = callRow.status;
  if (isAnswer) status = "in_progress";
  if (isHangup) status = "completed";

  const rowMeta = (() => {
    try {
      return JSON.parse(callRow.metadata_json ?? "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  })();
  const isWarmScreen =
    metadataIndicatesWarmScreen(callRow.metadata_json) ||
    (typeof payload.metadata?.purpose === "string" && payload.metadata.purpose === WARM_SCREEN_PURPOSE) ||
    (await callIsWarmScreenCall(callRow.id, callRow.metadata_json));

  const resultPending = isHangup && !callRow.approach_id && !isWarmScreen;
  if (resultPending) {
    await ensureDialSessionRoot(callRow.id);
    await clearPendingOnSiblingCalls(callRow.id);
  }

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
      metaJson: mergeApi4comWebhookMetadata(callRow.metadata_json, payload as Record<string, unknown>),
      eventId: webhookEventId,
      resultPending,
      now: nowIso()
    }
  );

  if (isAnswer && isWarmScreen && payload.id) {
    try {
      const dialUserRaw = rowMeta.dial_identity_user_id ?? rowMeta.user_id ?? callRow.user_id;
      const dialUserId = Number(dialUserRaw);
      const token = await resolveApi4comApiTokenForUser(
        Number.isFinite(dialUserId) ? dialUserId : callRow.user_id
      );
      if (token) {
        await api4comHangupCall(String(payload.id), token);
      }
    } catch {
      /* hangup best-effort */
    }
  }

  if (isHangup) {
    const { persistCallTechnicalResult } = await import("@/lib/api4com/persist-technical-result");
    await persistCallTechnicalResult(callRow.id);
    if (isWarmScreen) {
      const { finalizeWarmScreenCall } = await import("@/lib/warm-screen/call-outcome");
      await finalizeWarmScreenCall(callRow.id);
    }
  }

  return { ok: true, call_id: callRow.id, completed: isHangup };
}
