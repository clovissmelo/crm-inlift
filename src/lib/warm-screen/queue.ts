import type { ClientFilters } from "@/lib/clients-query";
import { queryProspeccaoQueue } from "@/lib/prospeccao-query";
import { get } from "@/lib/db";

/** Fila para o aquecedor: mesma base da prospecção, sem leads já aquecidos pelo motor. */
export async function queryWarmScreenLeadQueue(filters: ClientFilters) {
  return queryProspeccaoQueue({
    ...filters,
    exclude_warm_screen_confirmed: true
  });
}

export async function isClientWarmScreenConfirmed(clientId: number): Promise<boolean> {
  const row = await get<{ warm_screen_confirmed_at: string | null }>(
    "SELECT warm_screen_confirmed_at FROM clients WHERE id = @id",
    { id: clientId }
  );
  return Boolean(row?.warm_screen_confirmed_at);
}
