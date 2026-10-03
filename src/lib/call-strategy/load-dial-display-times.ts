import { normalizeApi4comCalledNumber } from "@/lib/api4com/phone";
import { listClientPhonesWithState } from "@/lib/call-strategy/client-phones";
import { all } from "@/lib/db";

/** Timestamps de ligações registradas + API4COM encerradas ainda sem complemento, por telefone. */
export async function loadDialDisplayTimesByPhone(clientId: number): Promise<Map<number, string[]>> {
  const phones = await listClientPhonesWithState(clientId);
  const map = new Map<number, string[]>();
  for (const p of phones) map.set(p.id, []);

  const digitsToPhoneId = new Map<string, number>();
  for (const p of phones) {
    digitsToPhoneId.set(p.phone_digits, p.id);
    if (p.display_phone) {
      const fromDisplay = normalizeApi4comCalledNumber(p.display_phone);
      if (fromDisplay) digitsToPhoneId.set(fromDisplay, p.id);
    }
  }

  const registered = await all<{ client_phone_id: number; created_at: string }>(
    `
      SELECT client_phone_id, created_at
      FROM phone_dial_attempts
      WHERE client_id = @clientId AND client_phone_id IS NOT NULL
      ORDER BY created_at ASC
    `,
    { clientId }
  );
  for (const row of registered) {
    const list = map.get(row.client_phone_id);
    if (list) list.push(row.created_at);
  }

  const unregistered = await all<{ phone_dialed: string; occurred_at: string }>(
    `
      SELECT ac.phone_dialed, COALESCE(ac.ended_at, ac.updated_at, ac.created_at) AS occurred_at
      FROM api4com_calls ac
      WHERE ac.client_id = @clientId
        AND ac.approach_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM phone_dial_attempts pda WHERE pda.api4com_call_id = ac.id
        )
        AND ac.status NOT IN ('initiating', 'ringing', 'in_progress')
      ORDER BY occurred_at ASC
    `,
    { clientId }
  );
  for (const row of unregistered) {
    const digits = normalizeApi4comCalledNumber(row.phone_dialed);
    if (!digits) continue;
    const phoneId = digitsToPhoneId.get(digits);
    if (phoneId == null) continue;
    map.get(phoneId)?.push(row.occurred_at);
  }

  for (const [id, times] of map) {
    times.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    map.set(id, times);
  }
  return map;
}
