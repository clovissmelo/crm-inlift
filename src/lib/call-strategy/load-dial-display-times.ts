import { listClientPhonesWithState } from "@/lib/call-strategy/client-phones";
import { all } from "@/lib/db";

/** Timestamps de tentativas que **consomem ciclo** (contam para esgotar o número). */
export async function loadDialDisplayTimesByPhone(clientId: number): Promise<Map<number, string[]>> {
  const phones = await listClientPhonesWithState(clientId);
  const map = new Map<number, string[]>();
  for (const p of phones) map.set(p.id, []);

  const registered = await all<{ client_phone_id: number; created_at: string }>(
    `
      SELECT client_phone_id, created_at
      FROM phone_dial_attempts
      WHERE client_id = @clientId
        AND client_phone_id IS NOT NULL
        AND consumes_cycle = true
      ORDER BY created_at ASC
    `,
    { clientId }
  );
  for (const row of registered) {
    const list = map.get(row.client_phone_id);
    if (list) list.push(row.created_at);
  }

  return map;
}
