import { all, get, nowIso, run } from "@/lib/db";
import { normalizeCnpj } from "@/lib/format";
import { parseLeadQualification } from "@/lib/lead-qualification";

export async function getClientDetail(id: number) {
  const client = await get<Record<string, unknown>>("SELECT * FROM clients WHERE id = @id", { id });
  if (!client) return null;

  const contacts = await all(
    "SELECT * FROM contacts WHERE client_id = @id ORDER BY is_primary_phone DESC, name",
    { id }
  );
  const productRows = await all<{ product_id: number; name: string }>(
    `
      SELECT cp.product_id, p.name
      FROM client_products cp
      JOIN products p ON p.id = cp.product_id
      WHERE cp.client_id = @id
      ORDER BY p.name
    `,
    { id }
  );
  const bdr = client.bdr_user_id
    ? await get<{ id: number; name: string }>("SELECT id, name FROM users WHERE id = @id", {
        id: client.bdr_user_id as number
      })
    : null;

  return { client, contacts, products: productRows, bdr };
}

export async function createClient(input: {
  cnpj?: string | null;
  legal_name?: string | null;
  trade_name?: string | null;
  segment?: string | null;
  city?: string | null;
  uf?: string | null;
  address?: string | null;
  website?: string | null;
  instagram?: string | null;
  notes?: string | null;
  bdr_user_id?: number | null;
  product_ids?: number[];
  lead_qualification?: "cold" | "warm" | "hot";
}) {
  const cnpj = normalizeCnpj(input.cnpj ?? "");
  if (cnpj) {
    const dup = await get<{ id: number }>("SELECT id FROM clients WHERE cnpj = @cnpj", { cnpj });
    if (dup) throw new Error("CNPJ já cadastrado");
  }

  const result = await run(
    `
      INSERT INTO clients (
        cnpj, legal_name, trade_name, segment, city, uf, address, website, instagram, notes,
        bdr_user_id, lead_qualification, created_at, updated_at
      ) VALUES (
        @cnpj, @legalName, @tradeName, @segment, @city, @uf, @address, @website, @instagram, @notes,
        @bdrUserId, @leadQualification, @createdAt, @updatedAt
      )
    `,
    {
      cnpj,
      legalName: input.legal_name ?? null,
      tradeName: input.trade_name ?? null,
      segment: input.segment ?? null,
      city: input.city ?? null,
      uf: input.uf ?? null,
      address: input.address ?? null,
      website: input.website ?? null,
      instagram: input.instagram ?? null,
      notes: input.notes ?? null,
      bdrUserId: input.bdr_user_id ?? null,
      leadQualification: parseLeadQualification(input.lead_qualification),
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
  );

  const clientId = result.lastInsertRowid;
  if (!clientId) throw new Error("Falha ao criar cliente");

  for (const productId of input.product_ids ?? []) {
    await run(
      "INSERT INTO client_products (client_id, product_id) VALUES (@clientId, @productId) ON CONFLICT DO NOTHING",
      { clientId, productId }
    );
  }

  return clientId;
}

export async function updateClient(
  id: number,
  input: {
    cnpj?: string | null;
    legal_name?: string | null;
    trade_name?: string | null;
    segment?: string | null;
    city?: string | null;
    uf?: string | null;
    address?: string | null;
    website?: string | null;
    instagram?: string | null;
    notes?: string | null;
    bdr_user_id?: number | null;
    product_ids?: number[];
    lead_qualification?: "cold" | "warm" | "hot";
  }
) {
  const cnpj = input.cnpj !== undefined ? normalizeCnpj(input.cnpj ?? "") : undefined;
  if (cnpj) {
    const dup = await get<{ id: number }>("SELECT id FROM clients WHERE cnpj = @cnpj AND id <> @id", { cnpj, id });
    if (dup) throw new Error("CNPJ já cadastrado");
  }

  await run(
    `
      UPDATE clients SET
        cnpj = COALESCE(@cnpj, cnpj),
        legal_name = COALESCE(@legalName, legal_name),
        trade_name = COALESCE(@tradeName, trade_name),
        segment = COALESCE(@segment, segment),
        city = COALESCE(@city, city),
        uf = COALESCE(@uf, uf),
        address = COALESCE(@address, address),
        website = COALESCE(@website, website),
        instagram = COALESCE(@instagram, instagram),
        notes = COALESCE(@notes, notes),
        bdr_user_id = COALESCE(@bdrUserId, bdr_user_id),
        lead_qualification = COALESCE(@leadQualification, lead_qualification),
        updated_at = @updatedAt
      WHERE id = @id
    `,
    {
      id,
      cnpj: cnpj ?? null,
      legalName: input.legal_name ?? null,
      tradeName: input.trade_name ?? null,
      segment: input.segment ?? null,
      city: input.city ?? null,
      uf: input.uf ?? null,
      address: input.address ?? null,
      website: input.website ?? null,
      instagram: input.instagram ?? null,
      notes: input.notes ?? null,
      bdrUserId: input.bdr_user_id === undefined ? null : input.bdr_user_id,
      leadQualification: input.lead_qualification ?? null,
      updatedAt: nowIso()
    }
  );

  if (input.product_ids) {
    await run("DELETE FROM client_products WHERE client_id = @id", { id });
    for (const productId of input.product_ids) {
      await run("INSERT INTO client_products (client_id, product_id) VALUES (@clientId, @productId)", {
        clientId: id,
        productId
      });
    }
  }
}

/** Vincula um produto ao cliente sem remover os já associados. */
export async function addClientProductLink(clientId: number, productId: number) {
  const client = await get<{ id: number }>("SELECT id FROM clients WHERE id = @id", { id: clientId });
  if (!client) throw new Error("Cliente não encontrado");
  const product = await get<{ id: number }>("SELECT id FROM products WHERE id = @id", { id: productId });
  if (!product) throw new Error("Produto não encontrado");
  await run(
    `
      INSERT INTO client_products (client_id, product_id)
      VALUES (@clientId, @productId)
      ON CONFLICT (client_id, product_id) DO NOTHING
    `,
    { clientId, productId }
  );
  await run("UPDATE clients SET updated_at = @now WHERE id = @id", { id: clientId, now: nowIso() });
}

/** Remove o cliente; contatos, oportunidades, agendamentos e demais vínculos em CASCADE no banco. */
export async function deleteClient(id: number) {
  const client = await get<{ id: number }>("SELECT id FROM clients WHERE id = @id", { id });
  if (!client) throw new Error("Cliente não encontrado");
  await run("DELETE FROM clients WHERE id = @id", { id });
}
