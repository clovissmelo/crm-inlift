import { all, get, nowIso, run } from "@/lib/db";

export async function ensureClientProductProspeccao(clientId: number, productId: number) {
  await run(
    `
      INSERT INTO client_product_prospeccao (client_id, product_id, in_prospeccao_queue, updated_at)
      VALUES (@clientId, @productId, true, @now)
      ON CONFLICT (client_id, product_id) DO NOTHING
    `,
    { clientId, productId, now: nowIso() }
  );
}

export async function isInProspeccaoQueue(clientId: number, productId: number | null): Promise<boolean> {
  if (productId == null) {
    const legacy = await get<{ in_prospeccao_queue: boolean }>(
      "SELECT in_prospeccao_queue FROM clients WHERE id = @id",
      { id: clientId }
    );
    return legacy?.in_prospeccao_queue ?? false;
  }
  const row = await get<{ in_prospeccao_queue: boolean }>(
    `
      SELECT in_prospeccao_queue FROM client_product_prospeccao
      WHERE client_id = @clientId AND product_id = @productId
    `,
    { clientId, productId }
  );
  if (row) return row.in_prospeccao_queue;
  const legacy = await get<{ in_prospeccao_queue: boolean }>(
    "SELECT in_prospeccao_queue FROM clients WHERE id = @id",
    { id: clientId }
  );
  return legacy?.in_prospeccao_queue ?? true;
}

export async function exitProspeccaoForProduct(
  clientId: number,
  productId: number,
  reason: string
): Promise<void> {
  const now = nowIso();
  await ensureClientProductProspeccao(clientId, productId);
  await run(
    `
      UPDATE client_product_prospeccao SET
        in_prospeccao_queue = false,
        exit_reason = @reason,
        exited_at = @now,
        updated_at = @now
      WHERE client_id = @clientId AND product_id = @productId
    `,
    { clientId, productId, reason, now }
  );
}

export async function exitProspeccaoAllProducts(clientId: number, reason: string): Promise<void> {
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
      WHERE id = @clientId
    `,
    { clientId, reason, now }
  );
}

export async function reenterProspeccaoProduct(clientId: number, productId: number): Promise<void> {
  const now = nowIso();
  await run(
    `
      INSERT INTO client_product_prospeccao (client_id, product_id, in_prospeccao_queue, exit_reason, exited_at, updated_at)
      VALUES (@clientId, @productId, true, NULL, NULL, @now)
      ON CONFLICT (client_id, product_id) DO UPDATE SET
        in_prospeccao_queue = true,
        exit_reason = NULL,
        exited_at = NULL,
        updated_at = EXCLUDED.updated_at
    `,
    { clientId, productId, now }
  );
}

export async function listActiveProductIdsInQueue(clientId: number): Promise<number[]> {
  const rows = await all<{ product_id: number }>(
    `
      SELECT product_id FROM client_product_prospeccao
      WHERE client_id = @clientId AND in_prospeccao_queue = true
    `,
    { clientId }
  );
  return rows.map((r) => r.product_id);
}
