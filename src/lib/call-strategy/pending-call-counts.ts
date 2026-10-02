import { normalizeApi4comCalledNumber } from "@/lib/api4com/phone";
import { listClientPhonesWithState } from "@/lib/call-strategy/client-phones";
import { all } from "@/lib/db";

/** Ligações encerradas ainda sem abordagem/registro na estratégia (contam no modal de discagem). */
export async function countUnregisteredEndedCallsByPhone(clientId: number): Promise<Map<number, number>> {
  const phones = await listClientPhonesWithState(clientId);
  if (phones.length === 0) return new Map();

  const calls = await all<{ id: number; phone_dialed: string }>(
    `
      SELECT id, phone_dialed
      FROM api4com_calls ac
      WHERE ac.client_id = @clientId
        AND ac.approach_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM phone_dial_attempts pda WHERE pda.api4com_call_id = ac.id
        )
        AND ac.status NOT IN ('initiating', 'ringing', 'in_progress')
    `,
    { clientId }
  );

  const digitsToPhoneId = new Map<string, number>();
  for (const p of phones) {
    digitsToPhoneId.set(p.phone_digits, p.id);
    if (p.display_phone) {
      const fromDisplay = normalizeApi4comCalledNumber(p.display_phone);
      if (fromDisplay) digitsToPhoneId.set(fromDisplay, p.id);
    }
  }

  const map = new Map<number, number>();
  for (const c of calls) {
    const digits = normalizeApi4comCalledNumber(c.phone_dialed);
    if (!digits) continue;
    const phoneId = digitsToPhoneId.get(digits);
    if (phoneId == null) continue;
    map.set(phoneId, (map.get(phoneId) ?? 0) + 1);
  }
  return map;
}
