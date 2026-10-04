import { all, get, nowIso, run } from "@/lib/db";
import { pickCallScriptBody, type MessageScriptPickRow } from "@/lib/pick-call-script";
import type { CallScriptLogEntry } from "@/lib/call-script-log";
import { parseCallScriptBody } from "@/lib/script-flow";
import { CONTACT_ORIGIN } from "@/lib/contact-origin";
import { syncClientPhonesFromContacts } from "@/lib/call-strategy/client-phones";
import { tryReenterProspeccaoAfterNewPhone } from "@/lib/call-strategy/queue-eval";
import { contactLayerFromScriptLog } from "@/lib/call-script-log";
import { setContactAsPrimaryPhone } from "@/lib/contacts";
import {
  contactPayloadFromCaptureNotes,
  mergeProfileTags,
  parseContactProfileTags
} from "@/lib/script-flow-capture-contact-utils";

async function loadActiveCallScriptBody(productId: number | null): Promise<string | null> {
  const rows = await all<MessageScriptPickRow>(
    `
      SELECT body, script_type, product_id, updated_at
      FROM message_scripts
      WHERE status = 'active' AND script_type = 'call'
    `
  );
  return pickCallScriptBody(rows, productId);
}

export async function enrichScriptLogEntryWithContactCreate(
  callId: number,
  entry: Omit<CallScriptLogEntry, "at">,
  previousLog: CallScriptLogEntry[]
): Promise<Omit<CallScriptLogEntry, "at">> {
  if (entry.action !== "capture" || !entry.capture_notes?.length) return entry;

  const call = await get<{ client_id: number | null; product_id: number | null }>(
    "SELECT client_id, product_id FROM api4com_calls WHERE id = @id",
    { id: callId }
  );
  if (!call?.client_id) return entry;

  const scriptBody = await loadActiveCallScriptBody(call.product_id);
  const flow = scriptBody ? parseCallScriptBody(scriptBody) : null;
  const screen = flow?.screens[entry.step_id];
  if (!screen) return entry;
  const contactBlock = screen.blocks.find((b) => b.kind === "contact_register");
  if (!contactBlock) return entry;

  const tag =
    contactBlock.kind === "contact_register"
      ? contactBlock.contact_profile_tag?.trim() || "PERFIL DECISOR"
      : "PERFIL DECISOR";
  const payload = contactPayloadFromCaptureNotes(entry.capture_notes);
  if (!payload) return entry;

  const prior = [...previousLog]
    .reverse()
    .find((e) => e.step_id === entry.step_id && e.action === "capture" && e.created_contact_id);

  if (prior?.created_contact_id) {
    const updatedId = await updateContactFromCapture(prior.created_contact_id, call.client_id, payload, tag);
    if (updatedId) {
      await maybeMarkCapturedContactPrimary(call.client_id, updatedId, previousLog);
      return { ...entry, created_contact_id: updatedId };
    }
    return entry;
  }

  const createdId = await insertContactFromCapture(call.client_id, payload, tag);
  if (createdId) {
    await maybeMarkCapturedContactPrimary(call.client_id, createdId, previousLog);
    return { ...entry, created_contact_id: createdId };
  }
  return entry;
}

async function maybeMarkCapturedContactPrimary(
  clientId: number,
  contactId: number,
  log: CallScriptLogEntry[]
) {
  if (contactLayerFromScriptLog(log) !== "decisor") return;
  try {
    await setContactAsPrimaryPhone(contactId);
    await syncClientPhonesFromContacts(clientId);
  } catch {
    /* telefone ausente ou contato inválido */
  }
}

async function insertContactFromCapture(
  clientId: number,
  payload: { name: string; phone: string | null; jobTitle: string | null; extraNotes: string | null },
  profileTag: string
): Promise<number | null> {
  const tags = mergeProfileTags([], profileTag);
  const result = await run(
    `
      INSERT INTO contacts (
        client_id, name, job_title, phone, whatsapp, email, notes,
        verification_status, origin, profile_tags, created_at, updated_at
      )
      VALUES (
        @clientId, @name, @jobTitle, @phone, NULL, NULL, @notes,
        'unverified', @origin, @profileTags::jsonb, @now, @now
      )
    `,
    {
      clientId,
      name: payload.name,
      jobTitle: payload.jobTitle,
      phone: payload.phone,
      notes: payload.extraNotes,
      origin: CONTACT_ORIGIN.callScript,
      profileTags: JSON.stringify(tags),
      now: nowIso()
    }
  );
  const id = Number(result.lastInsertRowid);
  if (!Number.isFinite(id)) return null;
  await syncClientPhonesFromContacts(clientId);
  await tryReenterProspeccaoAfterNewPhone(clientId);
  return id;
}

async function updateContactFromCapture(
  contactId: number,
  clientId: number,
  payload: { name: string; phone: string | null; jobTitle: string | null; extraNotes: string | null },
  profileTag: string
): Promise<number | null> {
  const row = await get<{ profile_tags: unknown }>(
    "SELECT profile_tags FROM contacts WHERE id = @id AND client_id = @clientId",
    { id: contactId, clientId }
  );
  if (!row) return null;
  const tags = mergeProfileTags(parseContactProfileTags(row.profile_tags), profileTag);
  await run(
    `
      UPDATE contacts SET
        name = @name,
        job_title = COALESCE(@jobTitle, job_title),
        phone = COALESCE(@phone, phone),
        notes = CASE WHEN @notes IS NOT NULL AND trim(@notes) <> '' THEN @notes ELSE notes END,
        profile_tags = @profileTags::jsonb,
        updated_at = @now
      WHERE id = @id AND client_id = @clientId
    `,
    {
      id: contactId,
      clientId,
      name: payload.name,
      jobTitle: payload.jobTitle,
      phone: payload.phone,
      notes: payload.extraNotes,
      profileTags: JSON.stringify(tags),
      now: nowIso()
    }
  );
  await syncClientPhonesFromContacts(clientId);
  await tryReenterProspeccaoAfterNewPhone(clientId);
  return contactId;
}
