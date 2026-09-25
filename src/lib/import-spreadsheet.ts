import { read, utils } from "xlsx";
import { normalizeCnpj } from "@/lib/format";
import { all, get, nowIso, run } from "@/lib/db";

export type ImportColumnKey =
  | "cnpj"
  | "legal_name"
  | "trade_name"
  | "segment"
  | "city"
  | "uf"
  | "address"
  | "website"
  | "instagram"
  | "notes"
  | "contact_name"
  | "contact_phone"
  | "contact_whatsapp"
  | "contact_email"
  | "skip";

export type ParsedRow = Record<string, string>;

export function parseSpreadsheetBuffer(buffer: Buffer, fileName: string) {
  const isCsv = fileName.toLowerCase().endsWith(".csv");
  const workbook = read(buffer, { type: "buffer", raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [] as string[], rows: [] as ParsedRow[] };
  const sheet = workbook.Sheets[sheetName];
  const matrix = utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, defval: "" });
  if (!matrix.length) return { headers: [], rows: [] };
  const headers = (matrix[0] ?? []).map((h) => String(h ?? "").trim());
  const rows: ParsedRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const line = matrix[i];
    if (!line || line.every((c) => String(c ?? "").trim() === "")) continue;
    const obj: ParsedRow = {};
    headers.forEach((header, idx) => {
      obj[header] = String(line[idx] ?? "").trim();
    });
    rows.push(obj);
  }
  return { headers, rows, isCsv };
}

function pick(row: ParsedRow, mapping: Record<string, ImportColumnKey>, key: ImportColumnKey) {
  const header = Object.entries(mapping).find(([, v]) => v === key)?.[0];
  if (!header) return "";
  return (row[header] ?? "").trim();
}

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
  possibleDuplicates: Array<{ row: number; trade_name: string; city: string | null }>;
};

export async function executeImport(options: {
  rows: ParsedRow[];
  mapping: Record<string, ImportColumnKey>;
  userId: number;
  fileName: string;
  defaultProductId?: number | null;
  defaultBdrUserId?: number | null;
}) {
  const result: ImportResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    possibleDuplicates: []
  };

  for (let index = 0; index < options.rows.length; index++) {
      const row = options.rows[index];
      const rowNum = index + 2;
      try {
        const cnpj = normalizeCnpj(pick(row, options.mapping, "cnpj"));
        const tradeName = pick(row, options.mapping, "trade_name");
        const legalName = pick(row, options.mapping, "legal_name");

        if (!cnpj && !tradeName && !legalName) {
          result.skipped++;
          continue;
        }

        let clientId: number | null = null;
        let isUpdate = false;

        if (cnpj) {
          const existing = await get<{ id: number }>("SELECT id FROM clients WHERE cnpj = @cnpj", { cnpj });
          if (existing) {
            clientId = existing.id;
            isUpdate = true;
            await run(
              `
                UPDATE clients SET
                  legal_name = COALESCE(NULLIF(@legalName, ''), legal_name),
                  trade_name = COALESCE(NULLIF(@tradeName, ''), trade_name),
                  segment = COALESCE(NULLIF(@segment, ''), segment),
                  city = COALESCE(NULLIF(@city, ''), city),
                  uf = COALESCE(NULLIF(@uf, ''), uf),
                  address = COALESCE(NULLIF(@address, ''), address),
                  website = COALESCE(NULLIF(@website, ''), website),
                  instagram = COALESCE(NULLIF(@instagram, ''), instagram),
                  notes = COALESCE(NULLIF(@notes, ''), notes),
                  updated_at = @updatedAt
                WHERE id = @id
              `,
              {
                id: clientId,
                legalName,
                tradeName,
                segment: pick(row, options.mapping, "segment"),
                city: pick(row, options.mapping, "city"),
                uf: pick(row, options.mapping, "uf"),
                address: pick(row, options.mapping, "address"),
                website: pick(row, options.mapping, "website"),
                instagram: pick(row, options.mapping, "instagram"),
                notes: pick(row, options.mapping, "notes"),
                updatedAt: nowIso()
              }
            );
          }
        }

        if (!clientId) {
          if (!cnpj && (tradeName || legalName)) {
            const dup = await all<{ id: number }>(
              `
                SELECT id FROM clients
                WHERE cnpj IS NULL
                  AND lower(coalesce(trade_name, '')) = lower(@tradeName)
                  AND lower(coalesce(city, '')) = lower(@city)
                LIMIT 1
              `,
              {
                tradeName: tradeName || legalName,
                city: pick(row, options.mapping, "city") || ""
              }
            );
            if (dup.length) {
              result.possibleDuplicates.push({
                row: rowNum,
                trade_name: tradeName || legalName,
                city: pick(row, options.mapping, "city") || null
              });
            }
          }

          const inserted = await run(
            `
              INSERT INTO clients (
                cnpj, legal_name, trade_name, segment, city, uf, address, website, instagram, notes,
                bdr_user_id, created_at, updated_at
              ) VALUES (
                @cnpj, @legalName, @tradeName, @segment, @city, @uf, @address, @website, @instagram, @notes,
                @bdrUserId, @createdAt, @updatedAt
              )
            `,
            {
              cnpj,
              legalName: legalName || null,
              tradeName: tradeName || null,
              segment: pick(row, options.mapping, "segment") || null,
              city: pick(row, options.mapping, "city") || null,
              uf: pick(row, options.mapping, "uf") || null,
              address: pick(row, options.mapping, "address") || null,
              website: pick(row, options.mapping, "website") || null,
              instagram: pick(row, options.mapping, "instagram") || null,
              notes: pick(row, options.mapping, "notes") || null,
              bdrUserId: options.defaultBdrUserId ?? null,
              createdAt: nowIso(),
              updatedAt: nowIso()
            }
          );
          clientId = inserted.lastInsertRowid ?? null;
          isUpdate = false;
        }

        if (!clientId) {
          result.errors.push({ row: rowNum, message: "Não foi possível salvar o cliente." });
          continue;
        }

        if (options.defaultProductId) {
          await run(
            `INSERT INTO client_products (client_id, product_id) VALUES (@clientId, @productId) ON CONFLICT DO NOTHING`,
            { clientId, productId: options.defaultProductId }
          );
        }

        if (options.defaultBdrUserId && isUpdate) {
          await run(
            `UPDATE clients SET bdr_user_id = COALESCE(bdr_user_id, @bdrUserId) WHERE id = @id`,
            { id: clientId, bdrUserId: options.defaultBdrUserId }
          );
        }

        const contactName = pick(row, options.mapping, "contact_name");
        const contactPhone = pick(row, options.mapping, "contact_phone");
        const contactWhatsapp = pick(row, options.mapping, "contact_whatsapp");
        const contactEmail = pick(row, options.mapping, "contact_email");
        if (contactName || contactPhone || contactWhatsapp || contactEmail) {
          await run(
            `
              INSERT INTO contacts (client_id, name, phone, whatsapp, email, created_at, updated_at)
              VALUES (@clientId, @name, @phone, @whatsapp, @email, @createdAt, @updatedAt)
            `,
            {
              clientId,
              name: contactName || "Contato importado",
              phone: contactPhone || null,
              whatsapp: contactWhatsapp || null,
              email: contactEmail || null,
              createdAt: nowIso(),
              updatedAt: nowIso()
            }
          );
        }

        if (isUpdate) result.updated++;
        else result.created++;
      } catch (e) {
        result.errors.push({ row: rowNum, message: e instanceof Error ? e.message : "Erro desconhecido" });
      }
    }

  await run(
    `
      INSERT INTO import_batches (
        file_name, imported_by_user_id, created_count, updated_count, skipped_count, error_count, details_json
      ) VALUES (@fileName, @userId, @created, @updated, @skipped, @errors, @details)
    `,
    {
      fileName: options.fileName,
      userId: options.userId,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors.length,
      details: JSON.stringify({ possibleDuplicates: result.possibleDuplicates, errors: result.errors })
    }
  );

  return result;
}
