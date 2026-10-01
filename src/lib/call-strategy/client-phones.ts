import { all, get, nowIso, run } from "@/lib/db";
import { normalizeApi4comCalledNumber } from "@/lib/api4com/phone";
import { CONTACT_PRIMARY_ORDER_SQL } from "@/lib/contacts";
import type { CallStrategySettings } from "@/lib/call-strategy/settings";

export type ClientPhoneRow = {
  id: number;
  client_id: number;
  phone_digits: string;
  display_phone: string | null;
  origin: string | null;
  primary_contact_id: number | null;
  sort_order: number;
  status: string;
  cycle_no_contact_count: number;
  cycle_no_answer_count: number;
  cycle_invalid_count: number;
  cycle_wrong_number_count: number;
  next_eligible_at: string | null;
  exhausted_at: string | null;
  needs_review: boolean;
  last_occurrence_kind: string | null;
};

export async function syncClientPhonesFromContacts(clientId: number): Promise<void> {
  const contacts = await all<{
    id: number;
    phone: string | null;
    whatsapp: string | null;
    origin: string | null;
    is_primary_phone: boolean;
  }>(
    `
      SELECT id, phone, whatsapp, origin, COALESCE(is_primary_phone, false) AS is_primary_phone
      FROM contacts c WHERE c.client_id = @clientId
      ORDER BY ${CONTACT_PRIMARY_ORDER_SQL}
    `,
    { clientId }
  );

  let order = 0;
  const seen = new Set<string>();
  for (const c of contacts) {
    const candidates: Array<{ digits: string; display: string; origin: string | null }> = [];
    for (const raw of [c.phone, c.whatsapp]) {
      if (!raw?.trim()) continue;
      const digits = normalizeApi4comCalledNumber(raw);
      if (!digits || seen.has(digits)) continue;
      seen.add(digits);
      candidates.push({ digits, display: raw.trim(), origin: c.origin });
    }
    for (const p of candidates) {
      const existing = await get<{ id: number }>(
        "SELECT id FROM client_phones WHERE client_id = @clientId AND phone_digits = @digits",
        { clientId, digits: p.digits }
      );
      if (existing) {
        await run(
          `
            UPDATE client_phones SET
              display_phone = COALESCE(@display, display_phone),
              origin = COALESCE(@origin, origin),
              primary_contact_id = COALESCE(primary_contact_id, @contactId),
              sort_order = LEAST(sort_order, @ord),
              updated_at = @now
            WHERE id = @id
          `,
          {
            id: existing.id,
            display: p.display,
            origin: p.origin,
            contactId: c.id,
            ord: order,
            now: nowIso()
          }
        );
      } else {
        const ins = await run(
          `
            INSERT INTO client_phones (
              client_id, phone_digits, display_phone, origin, primary_contact_id, sort_order, created_at, updated_at
            ) VALUES (@clientId, @digits, @display, @origin, @contactId, @ord, @now, @now)
          `,
          {
            clientId,
            digits: p.digits,
            display: p.display,
            origin: p.origin,
            contactId: c.id,
            ord: order,
            now: nowIso()
          }
        );
        const phoneId = ins.lastInsertRowid;
        if (phoneId) {
          await run(
            `
              INSERT INTO client_phone_dial_state (client_phone_id, status, updated_at)
              VALUES (@phoneId, 'available', @now)
              ON CONFLICT (client_phone_id) DO NOTHING
            `,
            { phoneId, now: nowIso() }
          );
        }
      }
      order += 1;
    }
  }
}

export async function listClientPhonesWithState(clientId: number): Promise<ClientPhoneRow[]> {
  await syncClientPhonesFromContacts(clientId);
  return all<ClientPhoneRow>(
    `
      SELECT
        cp.id, cp.client_id, cp.phone_digits, cp.display_phone, cp.origin,
        cp.primary_contact_id, cp.sort_order,
        COALESCE(st.status, 'available') AS status,
        COALESCE(st.cycle_no_contact_count, st.cycle_no_answer_count, 0) AS cycle_no_contact_count,
        COALESCE(st.cycle_no_answer_count, 0) AS cycle_no_answer_count,
        COALESCE(st.cycle_invalid_count, 0) AS cycle_invalid_count,
        COALESCE(st.cycle_wrong_number_count, 0) AS cycle_wrong_number_count,
        st.next_eligible_at,
        st.exhausted_at,
        COALESCE(st.needs_review, false) AS needs_review,
        st.last_occurrence_kind
      FROM client_phones cp
      LEFT JOIN client_phone_dial_state st ON st.client_phone_id = cp.id
      WHERE cp.client_id = @clientId
      ORDER BY cp.sort_order, cp.id
    `,
    { clientId }
  );
}

export function isPhoneEligibleNow(
  phone: ClientPhoneRow,
  settings: CallStrategySettings,
  now = Date.now()
): boolean {
  if (phone.status === "exhausted") return false;
  if (phone.next_eligible_at && new Date(phone.next_eligible_at).getTime() > now) return false;
  return true;
}

export function phoneAttemptLabel(phone: ClientPhoneRow, settings: CallStrategySettings): string {
  const max = settings.max_no_contact_attempts ?? settings.max_no_answer_attempts;
  const used = Math.max(phone.cycle_no_contact_count, phone.cycle_invalid_count, phone.cycle_wrong_number_count);
  return `Tentativa ${Math.min(used + 1, max)} de ${max}`;
}

export async function refreshClientPhoneSummary(clientId: number): Promise<string | null> {
  const phones = await listClientPhonesWithState(clientId);
  if (phones.length === 0) return "Sem telefone";
  let tried = 0;
  for (const p of phones) {
    const totalAttempts =
      p.cycle_no_contact_count + p.cycle_invalid_count + p.cycle_wrong_number_count;
    if (totalAttempts > 0) tried += 1;
  }
  const summary = `${tried} de ${phones.length} número${phones.length === 1 ? "" : "s"} tentados`;
  await run(
    "UPDATE clients SET prospeccao_phone_summary = @summary, updated_at = @now WHERE id = @id",
    { id: clientId, summary, now: nowIso() }
  );
  return summary;
}
