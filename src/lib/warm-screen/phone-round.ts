import { normalizeApi4comCalledNumber } from "@/lib/api4com/phone";
import { listClientPhonesWithState } from "@/lib/call-strategy/client-phones";
import { all, nowIso, run } from "@/lib/db";

export type WarmScreenDialTarget = {
  phone: string;
  primary_contact_id: number | null;
};

export async function getTriedPhoneDigitsForWarmItem(executionId: number, itemId: number): Promise<Set<string>> {
  const rows = await all<{ phone_dialed: string }>(
    `
      SELECT phone_dialed FROM api4com_calls
      WHERE approach_id IS NOT NULL
        AND metadata_json::jsonb ->> 'warm_screen_item_id' = @itemId
        AND metadata_json::jsonb ->> 'warm_screen_execution_id' = @execId
    `,
    { itemId: String(itemId), execId: String(executionId) }
  );
  const tried = new Set<string>();
  for (const row of rows) {
    const digits = normalizeApi4comCalledNumber(row.phone_dialed);
    if (digits) tried.add(digits);
  }
  return tried;
}

/** Próximo telefone cadastrado no lead ainda não discado nesta execução (1 tentativa por número). */
export async function getNextRegisteredPhoneForWarmItem(
  clientId: number,
  executionId: number,
  itemId: number
): Promise<WarmScreenDialTarget | null> {
  const tried = await getTriedPhoneDigitsForWarmItem(executionId, itemId);
  const phones = await listClientPhonesWithState(clientId);
  for (const p of phones) {
    const digits = normalizeApi4comCalledNumber(p.phone_digits) ?? p.phone_digits;
    if (tried.has(digits)) continue;
    return {
      phone: digits,
      primary_contact_id: p.primary_contact_id
    };
  }
  return null;
}

export async function resumeWarmScreenItemForNextPhone(input: { itemId: number; executionId: number }) {
  const now = nowIso();
  await run(
    `
      UPDATE warm_screen_execution_items SET
        status = 'pending',
        api4com_call_row_id = NULL,
        phone_dialed = NULL,
        contact_id = NULL,
        updated_at = @now
      WHERE id = @id AND execution_id = @execId
    `,
    { id: input.itemId, execId: input.executionId, now }
  );
  await run(
    `
      UPDATE warm_screen_executions SET
        last_call_ended_at = @now,
        current_item_id = NULL,
        updated_at = @now
      WHERE id = @execId
    `,
    { execId: input.executionId, now }
  );
}
