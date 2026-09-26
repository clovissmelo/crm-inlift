import { get, nowIso, run } from "@/lib/db";

/** Ordenação SQL: contato principal primeiro, depois id. */
export const CONTACT_PRIMARY_ORDER_SQL = "c.is_primary_phone DESC, c.id";

export async function setContactAsPrimaryPhone(contactId: number) {
  const row = await get<{ client_id: number; phone: string | null; whatsapp: string | null }>(
    "SELECT client_id, phone, whatsapp FROM contacts WHERE id = @id",
    { id: contactId }
  );
  if (!row) throw new Error("Contato não encontrado.");
  const hasPhone = Boolean(row.phone?.trim() || row.whatsapp?.trim());
  if (!hasPhone) throw new Error("Cadastre telefone ou WhatsApp antes de marcar como principal.");

  const now = nowIso();
  await run("UPDATE contacts SET is_primary_phone = false, updated_at = @now WHERE client_id = @clientId", {
    clientId: row.client_id,
    now
  });
  await run(
    "UPDATE contacts SET is_primary_phone = true, updated_at = @now WHERE id = @id AND client_id = @clientId",
    { id: contactId, clientId: row.client_id, now }
  );
}
