import crypto from "node:crypto";
import { google } from "googleapis";
import { get, nowIso, run } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/token-crypto";
import { meetingEndIso } from "@/lib/datetime";

export type GooglePublicStatus = {
  configured: boolean;
  connected: boolean;
  account_email: string | null;
  calendar_id: string | null;
};

function getOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function isGoogleOAuthConfigured() {
  return Boolean(getOAuthConfig());
}

export async function getGooglePublicStatus(): Promise<GooglePublicStatus> {
  const configured = isGoogleOAuthConfigured();
  const row = await get<{ account_email: string | null; calendar_id: string | null; refresh_token_encrypted: string | null }>(
    "SELECT account_email, calendar_id, refresh_token_encrypted FROM google_calendar_connection WHERE id = 1"
  );
  return {
    configured,
    connected: Boolean(configured && row?.refresh_token_encrypted),
    account_email: row?.account_email ?? null,
    calendar_id: row?.calendar_id ?? null
  };
}

export async function createOAuthState(userId: number) {
  const state = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await run("INSERT INTO google_oauth_states (state, user_id, expires_at) VALUES (@state, @userId, @expiresAt)", {
    state,
    userId,
    expiresAt
  });
  return state;
}

export async function consumeOAuthState(state: string) {
  const row = await get<{ user_id: number; expires_at: string }>(
    "SELECT user_id, expires_at FROM google_oauth_states WHERE state = @state",
    { state }
  );
  if (!row) return null;
  await run("DELETE FROM google_oauth_states WHERE state = @state", { state });
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.user_id;
}

export function buildGoogleAuthUrl(state: string) {
  const cfg = getOAuthConfig();
  if (!cfg) throw new Error("Google OAuth não configurado");
  const oauth2 = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
    state
  });
}

export async function saveTokensFromCode(code: string, userId: number) {
  const cfg = getOAuthConfig();
  if (!cfg) throw new Error("Google OAuth não configurado");
  const oauth2 = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error("Não foi recebido refresh_token. Desconecte a conta no Google e tente novamente com consent.");
  }
  oauth2.setCredentials(tokens);
  const oauth2api = google.oauth2({ version: "v2", auth: oauth2 });
  const me = await oauth2api.userinfo.get();
  const email = me.data.email ?? null;
  const encrypted = encryptSecret(tokens.refresh_token);
  await run(
    `
      INSERT INTO google_calendar_connection (
        id, account_email, calendar_id, refresh_token_encrypted, access_token,
        access_token_expires_at, connected_by_user_id, connected_at, updated_at
      ) VALUES (1, @email, 'primary', @refresh, @access, @expires, @userId, @now, @now)
      ON CONFLICT (id) DO UPDATE SET
        account_email = EXCLUDED.account_email,
        refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
        access_token = EXCLUDED.access_token,
        access_token_expires_at = EXCLUDED.access_token_expires_at,
        connected_by_user_id = EXCLUDED.connected_by_user_id,
        connected_at = EXCLUDED.connected_at,
        updated_at = EXCLUDED.updated_at
    `,
    {
      email,
      refresh: encrypted,
      access: tokens.access_token ?? null,
      expires: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      userId,
      now: nowIso()
    }
  );
}

export async function disconnectGoogle() {
  await run(
    `
      UPDATE google_calendar_connection SET
        account_email = NULL,
        refresh_token_encrypted = NULL,
        access_token = NULL,
        access_token_expires_at = NULL,
        connected_by_user_id = NULL,
        connected_at = NULL,
        updated_at = @now
      WHERE id = 1
    `,
    { now: nowIso() }
  );
}

async function getAuthorizedClient() {
  const cfg = getOAuthConfig();
  if (!cfg) return null;
  const row = await get<{
    refresh_token_encrypted: string | null;
    access_token: string | null;
    access_token_expires_at: string | null;
    calendar_id: string | null;
    account_email: string | null;
  }>("SELECT * FROM google_calendar_connection WHERE id = 1");
  if (!row?.refresh_token_encrypted) return null;

  const oauth2 = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
  const refreshToken = decryptSecret(row.refresh_token_encrypted);
  oauth2.setCredentials({
    refresh_token: refreshToken,
    access_token: row.access_token ?? undefined,
    expiry_date: row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : undefined
  });

  oauth2.on("tokens", async (tokens) => {
    if (!tokens.access_token) return;
    await run(
      `
        UPDATE google_calendar_connection SET
          access_token = @access,
          access_token_expires_at = @expires,
          updated_at = @now
        WHERE id = 1
      `,
      {
        access: tokens.access_token,
        expires: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        now: nowIso()
      }
    );
  });

  return { oauth2, calendarId: row.calendar_id || "primary", accountEmail: row.account_email };
}

type MeetingSyncRow = {
  id: number;
  title: string;
  starts_at: string;
  duration_minutes: number;
  notes: string | null;
  google_event_id: string | null;
  meet_link: string | null;
  status: string;
};

export async function syncMeetingToGoogle(meetingId: number) {
  const status = await getGooglePublicStatus();
  if (!status.connected) {
    await run(
      `UPDATE meetings SET google_sync_status = 'none', google_sync_error = NULL, updated_at = @now WHERE id = @id`,
      { id: meetingId, now: nowIso() }
    );
    return { ok: false as const, error: "Google Agenda não conectado" };
  }

  const auth = await getAuthorizedClient();
  if (!auth) return { ok: false as const, error: "Google Agenda não conectado" };

  const meeting = await get<MeetingSyncRow>("SELECT * FROM meetings WHERE id = @id", { id: meetingId });
  if (!meeting) return { ok: false as const, error: "Reunião não encontrada" };
  if (meeting.status === "cancelled") {
    return cancelMeetingOnGoogle(meetingId);
  }

  const { all } = await import("@/lib/db");
  const internal = await all<{ email: string }>(
    `
      SELECT u.email FROM meeting_internal_participants mip
      JOIN users u ON u.id = mip.user_id
      WHERE mip.meeting_id = @id AND u.email IS NOT NULL
    `,
    { id: meetingId }
  );
  const external = await all<{ email: string; display_name: string | null }>(
    "SELECT email, display_name FROM meeting_external_participants WHERE meeting_id = @id",
    { id: meetingId }
  );

  const attendees = [
    ...internal.map((u) => ({ email: u.email })),
    ...external.map((e) => ({ email: e.email, displayName: e.display_name ?? undefined }))
  ];

  const calendar = google.calendar({ version: "v3", auth: auth.oauth2 });
  const end = meetingEndIso(meeting.starts_at, meeting.duration_minutes);
  const requestId = `funon-meeting-${meetingId}-${meeting.google_event_id ? "update" : "create"}`;

  const eventBody = {
    summary: meeting.title,
    description: meeting.notes ?? undefined,
    start: { dateTime: meeting.starts_at, timeZone: "America/Sao_Paulo" },
    end: { dateTime: end, timeZone: "America/Sao_Paulo" },
    attendees,
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: "hangoutsMeet" }
      }
    }
  };

  await run(
    `UPDATE meetings SET google_sync_status = 'pending', google_sync_error = NULL, updated_at = @now WHERE id = @id`,
    { id: meetingId, now: nowIso() }
  );

  try {
    let eventId = meeting.google_event_id;
    let meetLink = meeting.meet_link;
    let response;
    if (eventId) {
      response = await calendar.events.patch({
        calendarId: auth.calendarId,
        eventId,
        requestBody: eventBody,
        conferenceDataVersion: 1,
        sendUpdates: "all"
      });
    } else {
      response = await calendar.events.insert({
        calendarId: auth.calendarId,
        requestBody: eventBody,
        conferenceDataVersion: 1,
        sendUpdates: "all"
      });
      eventId = response.data.id ?? null;
    }
    meetLink =
      response.data.hangoutLink ??
      response.data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ??
      meetLink;

    await run(
      `
        UPDATE meetings SET
          google_event_id = @eventId,
          google_calendar_id = @calendarId,
          meet_link = @meetLink,
          google_sync_status = 'synced',
          google_sync_error = NULL,
          google_synced_at = @now,
          updated_at = @now
        WHERE id = @id
      `,
      {
        id: meetingId,
        eventId,
        calendarId: auth.calendarId,
        meetLink,
        now: nowIso()
      }
    );
    return { ok: true as const, meet_link: meetLink };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao sincronizar";
    await run(
      `
        UPDATE meetings SET google_sync_status = 'error', google_sync_error = @error, updated_at = @now
        WHERE id = @id
      `,
      { id: meetingId, error: message.slice(0, 500), now: nowIso() }
    );
    return { ok: false as const, error: message };
  }
}

export async function cancelMeetingOnGoogle(meetingId: number) {
  const auth = await getAuthorizedClient();
  const meeting = await get<{ google_event_id: string | null; google_calendar_id: string | null }>(
    "SELECT google_event_id, google_calendar_id FROM meetings WHERE id = @id",
    { id: meetingId }
  );
  if (!auth || !meeting?.google_event_id) {
    await run(
      `UPDATE meetings SET google_sync_status = 'none', updated_at = @now WHERE id = @id`,
      { id: meetingId, now: nowIso() }
    );
    return { ok: true as const };
  }
  try {
    const calendar = google.calendar({ version: "v3", auth: auth.oauth2 });
    await calendar.events.delete({
      calendarId: meeting.google_calendar_id || auth.calendarId,
      eventId: meeting.google_event_id,
      sendUpdates: "all"
    });
    await run(
      `
        UPDATE meetings SET google_sync_status = 'synced', google_sync_error = NULL, google_synced_at = @now, updated_at = @now
        WHERE id = @id
      `,
      { id: meetingId, now: nowIso() }
    );
    return { ok: true as const };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao cancelar no Google";
    await run(
      `UPDATE meetings SET google_sync_status = 'error', google_sync_error = @error, updated_at = @now WHERE id = @id`,
      { id: meetingId, error: message.slice(0, 500), now: nowIso() }
    );
    return { ok: false as const, error: message };
  }
}
