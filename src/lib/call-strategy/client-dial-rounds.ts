import { all, get, nowIso, run } from "@/lib/db";
import { listClientPhonesWithState } from "@/lib/call-strategy/client-phones";

/** Telefones que entram na rodada (não esgotados). */
export async function listRoundEligiblePhoneIds(clientId: number): Promise<number[]> {
  const phones = await listClientPhonesWithState(clientId);
  return phones.filter((p) => p.status !== "exhausted").map((p) => p.id);
}

export async function getClientDialRoundState(clientId: number): Promise<{
  completedRounds: number;
  hasAnyDialAttempt: boolean;
}> {
  const row = await get<{ completed: number; attempts: string }>(
    `
      SELECT
        COALESCE(c.prospeccao_completed_dial_rounds, 0) AS completed,
        (
          SELECT COUNT(*)::text FROM phone_dial_attempts pda WHERE pda.client_id = c.id
        ) AS attempts
      FROM clients c
      WHERE c.id = @clientId
    `,
    { clientId }
  );
  const attempts = Number(row?.attempts ?? 0);
  return {
    completedRounds: row?.completed ?? 0,
    hasAnyDialAttempt: attempts > 0
  };
}

/** Registra discagem na rodada atual e conclui rodada quando todos os números elegíveis foram tocados. */
export async function recordDialRoundTouch(clientId: number, clientPhoneId: number): Promise<void> {
  const eligible = await listRoundEligiblePhoneIds(clientId);
  if (eligible.length === 0) return;
  if (!eligible.includes(clientPhoneId)) return;

  const now = nowIso();
  await run(
    `
      INSERT INTO client_dial_round_progress (client_id, client_phone_id, touched_at)
      VALUES (@clientId, @phoneId, @now)
      ON CONFLICT (client_id, client_phone_id) DO UPDATE SET touched_at = EXCLUDED.touched_at
    `,
    { clientId, phoneId: clientPhoneId, now }
  );

  const touched = await all<{ client_phone_id: number }>(
    `SELECT client_phone_id FROM client_dial_round_progress WHERE client_id = @clientId`,
    { clientId }
  );
  const touchedSet = new Set(touched.map((t) => t.client_phone_id));
  const allTouched = eligible.every((id) => touchedSet.has(id));
  if (!allTouched) return;

  await run(
    `
      UPDATE clients SET
        prospeccao_completed_dial_rounds = COALESCE(prospeccao_completed_dial_rounds, 0) + 1,
        updated_at = @now
      WHERE id = @clientId
    `,
    { clientId, now }
  );
  await run(`DELETE FROM client_dial_round_progress WHERE client_id = @clientId`, { clientId });
}
