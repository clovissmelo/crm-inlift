import { get } from "@/lib/db";

/** Última entrada de leads (importação em lote ou cliente criado manualmente). */
export async function getProspeccaoLeadsLastUpdatedAt(): Promise<string | null> {
  const row = await get<{ last_at: string | null }>(
    `
      SELECT MAX(ts) AS last_at FROM (
        SELECT imported_at AS ts FROM import_batches
        UNION ALL
        SELECT created_at AS ts FROM clients
      ) sources
    `
  );
  return row?.last_at ?? null;
}
