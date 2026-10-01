import { nowIso, run } from "@/lib/db";
import {
  listClientPhonesWithState,
  refreshClientPhoneSummary,
  isPhoneEligibleNow
} from "@/lib/call-strategy/client-phones";
import { getCallStrategySettings } from "@/lib/call-strategy/settings";

export async function evaluateProspeccaoQueueAfterAttempt(clientId: number): Promise<void> {
  await refreshClientPhoneSummary(clientId);
  const phones = await listClientPhonesWithState(clientId);
  if (phones.length === 0) return;

  const settings = await getCallStrategySettings();
  const now = Date.now();
  let anyUsable = false;
  let allExhausted = true;

  for (const p of phones) {
    if (p.status !== "exhausted") {
      allExhausted = false;
      if (isPhoneEligibleNow(p, settings, now)) anyUsable = true;
      if (p.status === "waiting" && p.next_eligible_at && new Date(p.next_eligible_at).getTime() <= now) {
        anyUsable = true;
      }
      if (p.status === "available") anyUsable = true;
    }
  }

  if (allExhausted) {
    await run(
      `
        UPDATE clients SET
          in_prospeccao_queue = false,
          prospeccao_exit_reason = 'phones_exhausted',
          prospeccao_exited_at = @now,
          updated_at = @now
        WHERE id = @id AND in_prospeccao_queue = true
      `,
      { id: clientId, now: nowIso() }
    );
    return;
  }

  if (anyUsable) {
    await run(
      `
        UPDATE clients SET
          in_prospeccao_queue = true,
          prospeccao_exit_reason = NULL,
          prospeccao_exited_at = NULL,
          updated_at = @now
        WHERE id = @id AND prospeccao_exit_reason = 'phones_exhausted'
      `,
      { id: clientId, now: nowIso() }
    );
  }
}

export async function tryReenterProspeccaoAfterNewPhone(clientId: number): Promise<void> {
  const client = await import("@/lib/db").then((m) =>
    m.get<{ in_prospeccao_queue: boolean; prospeccao_exit_reason: string | null }>(
      "SELECT in_prospeccao_queue, prospeccao_exit_reason FROM clients WHERE id = @id",
      { id: clientId }
    )
  );
  if (!client || client.in_prospeccao_queue) return;
  if (client.prospeccao_exit_reason !== "phones_exhausted") return;

  const phones = await listClientPhonesWithState(clientId);
  const hasDialable = phones.some((p) => p.status !== "exhausted");
  if (!hasDialable) return;

  await run(
    `
      UPDATE clients SET
        in_prospeccao_queue = true,
        prospeccao_exit_reason = NULL,
        prospeccao_exited_at = NULL,
        updated_at = @now
      WHERE id = @id
    `,
    { id: clientId, now: nowIso() }
  );
  await refreshClientPhoneSummary(clientId);
}

export async function exitProspeccaoCommercial(clientId: number, reason: string): Promise<void> {
  await run(
    `
      UPDATE clients SET
        in_prospeccao_queue = false,
        prospeccao_exit_reason = @reason,
        prospeccao_exited_at = @now,
        updated_at = @now
      WHERE id = @id
    `,
    { id: clientId, reason, now: nowIso() }
  );
}
