import { all, get, nowIso, run } from "@/lib/db";
import { normalizeCnpj } from "@/lib/format";

export type CompanyRecord = {
  id: number;
  name: string;
  legal_name: string | null;
  cnpj: string | null;
  responsible_user_id: number | null;
  responsible_name: string | null;
  status: "active" | "inactive";
};

export async function listCompanies(activeOnly = false) {
  return all<CompanyRecord>(
    `
      SELECT c.id, c.name, c.legal_name, c.cnpj, c.responsible_user_id, c.status,
        u.name AS responsible_name
      FROM companies c
      LEFT JOIN users u ON u.id = c.responsible_user_id
      ${activeOnly ? "WHERE c.status = 'active'" : ""}
      ORDER BY c.name
    `
  );
}

export async function getCompany(id: number) {
  return get<CompanyRecord>(
    `
      SELECT c.id, c.name, c.legal_name, c.cnpj, c.responsible_user_id, c.status,
        u.name AS responsible_name
      FROM companies c
      LEFT JOIN users u ON u.id = c.responsible_user_id
      WHERE c.id = @id
    `,
    { id }
  );
}

export async function saveCompany(input: {
  id?: number;
  name: string;
  legal_name?: string | null;
  cnpj?: string | null;
  responsible_user_id?: number | null;
  status: "active" | "inactive";
}) {
  const cnpj = input.cnpj ? normalizeCnpj(input.cnpj) : null;
  if (input.id) {
    await run(
      `
        UPDATE companies SET
          name = @name,
          legal_name = @legalName,
          cnpj = @cnpj,
          responsible_user_id = @responsibleUserId,
          status = @status,
          updated_at = @updatedAt
        WHERE id = @id
      `,
      {
        id: input.id,
        name: input.name.trim(),
        legalName: input.legal_name?.trim() || null,
        cnpj,
        responsibleUserId: input.responsible_user_id ?? null,
        status: input.status,
        updatedAt: nowIso()
      }
    );
    return input.id;
  }
  const result = await run(
    `
      INSERT INTO companies (name, legal_name, cnpj, responsible_user_id, status, created_at, updated_at)
      VALUES (@name, @legalName, @cnpj, @responsibleUserId, @status, @createdAt, @updatedAt)
    `,
    {
      name: input.name.trim(),
      legalName: input.legal_name?.trim() || null,
      cnpj,
      responsibleUserId: input.responsible_user_id ?? null,
      status: input.status,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
  );
  return result.lastInsertRowid as number;
}

export async function deleteCompany(id: number) {
  const used = await get<{ count: string }>("SELECT COUNT(*)::text AS count FROM products WHERE company_id = @id", { id });
  if (Number(used?.count ?? 0) > 0) {
    throw new Error("Empresa possui produtos vinculados");
  }
  await run("DELETE FROM companies WHERE id = @id", { id });
}
