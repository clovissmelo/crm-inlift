import { all, get, nowIso, run } from "@/lib/db";
import { listClientPhonesWithState, refreshClientPhoneSummary } from "@/lib/call-strategy/client-phones";
import { ensureClientProductProspeccao, listActiveProductIdsInQueue } from "@/lib/client-product-prospeccao";

async function phonesExhaustedForClient(clientId: number): Promise<boolean> {
  const phones = await listClientPhonesWithState(clientId);
  if (phones.length === 0) return false;
  return phones.every((p) => p.status === "exhausted");
}

/** Esgotamento operacional: só retira da fila do produto quando não há número discável. */
export async function evaluateProspeccaoQueueAfterAttempt(
  clientId: number,
  productId?: number | null
): Promise<void> {
  await refreshClientPhoneSummary(clientId);
  const exhausted = await phonesExhaustedForClient(clientId);

  if (exhausted) {
    await run(
      `
        UPDATE client_product_prospeccao SET
          in_prospeccao_queue = false,
          exit_reason = 'phones_exhausted',
          exited_at = @now,
          updated_at = @now
        WHERE client_id = @clientId AND in_prospeccao_queue = true
          AND (exit_reason IS NULL OR exit_reason = 'phones_exhausted')
      `,
      { clientId, now: nowIso() }
    );
  }

  if (productId != null) {
    await ensureClientProductProspeccao(clientId, productId);
    if (exhausted) {
      /* já sincronizado acima para todos os produtos ainda na fila */
    } else {
      await run(
        `
          UPDATE client_product_prospeccao SET
            in_prospeccao_queue = true,
            exit_reason = NULL,
            exited_at = NULL,
            updated_at = @now
          WHERE client_id = @clientId AND product_id = @productId AND exit_reason = 'phones_exhausted'
        `,
        { clientId, productId, now: nowIso() }
      );
    }
  }

  const activeProducts = await listActiveProductIdsInQueue(clientId);
  const legacyInQueue = activeProducts.length > 0 || (productId == null && !exhausted);

  if (exhausted && activeProducts.length === 0) {
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

  if (legacyInQueue) {
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
  const client = await get<{ in_prospeccao_queue: boolean; prospeccao_exit_reason: string | null }>(
    "SELECT in_prospeccao_queue, prospeccao_exit_reason FROM clients WHERE id = @id",
    { id: clientId }
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

  const productRows = await all<{ product_id: number }>(
    `
      SELECT product_id FROM client_product_prospeccao
      WHERE client_id = @clientId AND exit_reason = 'phones_exhausted'
    `,
    { clientId }
  );
  for (const row of productRows) {
    await run(
      `
        UPDATE client_product_prospeccao SET
          in_prospeccao_queue = true,
          exit_reason = NULL,
          exited_at = NULL,
          updated_at = @now
        WHERE client_id = @clientId AND product_id = @productId
      `,
      { clientId, productId: row.product_id, now: nowIso() }
    );
  }

  await refreshClientPhoneSummary(clientId);
}

/** Encerramento comercial legado (cliente inteiro) — preferir exitProspeccaoForProduct. */
export async function exitProspeccaoCommercial(clientId: number, reason: string): Promise<void> {
  const now = nowIso();
  await run(
    `
      UPDATE client_product_prospeccao SET
        in_prospeccao_queue = false,
        exit_reason = @reason,
        exited_at = @now,
        updated_at = @now
      WHERE client_id = @clientId AND in_prospeccao_queue = true
    `,
    { clientId, reason, now }
  );
  await run(
    `
      UPDATE clients SET
        in_prospeccao_queue = false,
        prospeccao_exit_reason = @reason,
        prospeccao_exited_at = @now,
        updated_at = @now
      WHERE id = @id
    `,
    { id: clientId, reason, now }
  );
}
