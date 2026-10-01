import { all, get } from "@/lib/db";

export type ContactOutcomeTypeRow = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  status: string;
  requires_conversation: boolean;
};

export async function listActiveContactOutcomeTypes(): Promise<ContactOutcomeTypeRow[]> {
  return all<ContactOutcomeTypeRow>(
    `
      SELECT id, slug, name, description, sort_order, status, requires_conversation
      FROM contact_outcome_types
      WHERE status = 'active'
      ORDER BY sort_order, id
    `
  );
}

export async function getContactOutcomeTypeById(id: number) {
  return get<ContactOutcomeTypeRow>(
    `
      SELECT id, slug, name, description, sort_order, status, requires_conversation
      FROM contact_outcome_types WHERE id = @id
    `,
    { id }
  );
}

export async function getContactOutcomeTypeBySlug(slug: string) {
  return get<ContactOutcomeTypeRow>(
    `
      SELECT id, slug, name, description, sort_order, status, requires_conversation
      FROM contact_outcome_types WHERE slug = @slug AND status = 'active'
      LIMIT 1
    `,
    { slug }
  );
}

export async function listCompatibleCommercialIds(contactOutcomeTypeId: number): Promise<number[]> {
  const rows = await all<{ commercial_result_type_id: number }>(
    `
      SELECT commercial_result_type_id
      FROM contact_commercial_compat
      WHERE contact_outcome_type_id = @contactId
    `,
    { contactId: contactOutcomeTypeId }
  );
  return rows.map((r) => r.commercial_result_type_id);
}

export async function isCommercialCompatible(contactOutcomeTypeId: number, commercialResultTypeId: number): Promise<boolean> {
  const row = await get<{ ok: number }>(
    `
      SELECT 1 AS ok FROM contact_commercial_compat
      WHERE contact_outcome_type_id = @contactId AND commercial_result_type_id = @commercialId
      LIMIT 1
    `,
    { contactId: contactOutcomeTypeId, commercialId: commercialResultTypeId }
  );
  return Boolean(row?.ok);
}
