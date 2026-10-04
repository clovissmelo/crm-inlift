import { all, get, nowIso, run } from "@/lib/db";
import { pickCallScriptBody, type MessageScriptPickRow } from "@/lib/pick-call-script";
import type { CallScriptCaptureNote, CallScriptLogEntry } from "@/lib/call-script-log";
import { parseCallScriptBody, type ScriptFlowStep } from "@/lib/script-flow";
import { CONTACT_ORIGIN } from "@/lib/contact-origin";
import { syncClientPhonesFromContacts } from "@/lib/call-strategy/client-phones";
import { tryReenterProspeccaoAfterNewPhone } from "@/lib/call-strategy/queue-eval";

const NAME_KEYS = new Set(["nome", "name", "contacted_person_name"]);
const PHONE_KEYS = new Set(["telefone", "phone", "whatsapp", "tel", "celular"]);
const JOB_KEYS = new Set(["cargo", "funcao", "job_title", "funcao_cargo"]);

export function parseContactProfileTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t).trim()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed.map((t) => String(t).trim()).filter(Boolean);
    } catch {
      return [raw.trim()];
    }
  }
  return [];
}

export function mergeProfileTags(existing: string[], add: string): string[] {
  const tag = add.trim();
  if (!tag) return existing;
  const set = new Set(existing.map((t) => t.trim()).filter(Boolean));
  set.add(tag);
  return [...set];
}

export function contactPayloadFromCaptureNotes(notes: CallScriptCaptureNote[]): {
  name: string;
  phone: string | null;
  jobTitle: string | null;
  extraNotes: string | null;
} | null {
  let name = "";
  let phone: string | null = null;
  let jobTitle: string | null = null;
  const extras: string[] = [];

  for (const n of notes) {
    const val = n.value.trim();
    if (!val) continue;
    const key = (n.field_key ?? "").trim().toLowerCase();
    if (NAME_KEYS.has(key) || (!key && /nome/i.test(n.label))) {
      name = val;
      continue;
    }
    if (PHONE_KEYS.has(key) || (!key && /telefone|whatsapp|celular/i.test(n.label))) {
      phone = val;
      continue;
    }
    if (JOB_KEYS.has(key) || (!key && /cargo|função|funcao/i.test(n.label))) {
      jobTitle = val;
      continue;
    }
    extras.push(`${n.label}: ${val}`);
  }

  if (!name.trim()) return null;
  return {
    name: name.trim(),
    phone,
    jobTitle,
    extraNotes: extras.length ? extras.join("\n") : null
  };
}

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
  const step = flow?.steps[entry.step_id];
  if (!step || step.type !== "capture") return entry;
  if (step.create_contact !== "create") return entry;

  const tag = step.contact_profile_tag?.trim() || "PERFIL DECISOR";
  const payload = contactPayloadFromCaptureNotes(entry.capture_notes);
  if (!payload) return entry;

  const prior = [...previousLog]
    .reverse()
    .find((e) => e.step_id === entry.step_id && e.action === "capture" && e.created_contact_id);

  if (prior?.created_contact_id) {
    const updatedId = await updateContactFromCapture(prior.created_contact_id, call.client_id, payload, tag);
    if (updatedId) return { ...entry, created_contact_id: updatedId };
    return entry;
  }

  const createdId = await insertContactFromCapture(call.client_id, payload, tag);
  if (createdId) return { ...entry, created_contact_id: createdId };
  return entry;
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

export function captureStepCreatesContact(step: ScriptFlowStep | null | undefined): boolean {
  return step?.type === "capture" && step.create_contact === "create";
}

export function captureStepContactTag(step: ScriptFlowStep | null | undefined): string | null {
  if (!captureStepCreatesContact(step)) return null;
  if (step?.type !== "capture") return null;
  return step.contact_profile_tag?.trim() || "PERFIL DECISOR";
}
