import { all, get } from "@/lib/db";
import { normalizeApi4comCalledNumber } from "@/lib/api4com/phone";
import { CONTACT_PRIMARY_ORDER_SQL } from "@/lib/contacts";

export type DialQueueOption = {
  contact_id: number;
  contact_name: string | null;
  phone: string;
  phone_display: string;
  kind: "phone" | "whatsapp";
};

function normKey(phone: string) {
  return normalizeApi4comCalledNumber(phone) ?? phone.replace(/\D/g, "");
}

export async function resolveDialSessionRootId(callId: number): Promise<number> {
  const row = await get<{ id: number; dial_session_root_id: number | null }>(
    "SELECT id, dial_session_root_id FROM api4com_calls WHERE id = @id",
    { id: callId }
  );
  if (!row) throw new Error("Chamada não encontrada");
  return row.dial_session_root_id ?? row.id;
}

export async function listClientDialOptions(
  clientId: number,
  sessionRootId: number
): Promise<DialQueueOption[]> {
  const contacts = await all<{
    id: number;
    name: string | null;
    phone: string | null;
    whatsapp: string | null;
  }>(
    `
      SELECT id, name, phone, whatsapp
      FROM contacts
      WHERE client_id = @clientId
      ORDER BY ${CONTACT_PRIMARY_ORDER_SQL}
    `,
    { clientId }
  );

  const dialed = await all<{ phone: string }>(
    `
      SELECT phone_dialed AS phone FROM api4com_calls
      WHERE client_id = @clientId
        AND COALESCE(dial_session_root_id, id) = @sessionRoot
    `,
    { clientId, sessionRoot: sessionRootId }
  );
  const skipped = await all<{ phone: string }>(
    "SELECT phone FROM api4com_dial_skips WHERE dial_session_root_id = @sessionRoot",
    { sessionRoot: sessionRootId }
  );

  const used = new Set<string>();
  for (const row of [...dialed, ...skipped]) {
    used.add(normKey(row.phone));
  }

  const options: DialQueueOption[] = [];
  const seenInOptions = new Set<string>();

  for (const c of contacts) {
    const pairs: Array<{ phone: string; kind: "phone" | "whatsapp" }> = [];
    if (c.phone?.trim()) pairs.push({ phone: c.phone.trim(), kind: "phone" });
    if (c.whatsapp?.trim()) pairs.push({ phone: c.whatsapp.trim(), kind: "whatsapp" });

    for (const p of pairs) {
      const normalized = normalizeApi4comCalledNumber(p.phone);
      if (!normalized) continue;
      const key = normKey(normalized);
      if (used.has(key) || seenInOptions.has(key)) continue;
      seenInOptions.add(key);
      options.push({
        contact_id: c.id,
        contact_name: c.name,
        phone: normalized,
        phone_display: p.phone,
        kind: p.kind
      });
    }
  }

  return options;
}

export async function getClientProductIds(clientId: number): Promise<number[]> {
  const rows = await all<{ product_id: number }>(
    "SELECT product_id FROM client_products WHERE client_id = @clientId ORDER BY product_id",
    { clientId }
  );
  return rows.map((r) => r.product_id);
}
