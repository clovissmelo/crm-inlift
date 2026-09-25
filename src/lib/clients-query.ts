import { all } from "@/lib/db";
import { isMobileBr, phoneDigits } from "@/lib/format";
import type { ClientListItem } from "@/lib/types";

export type ProspeccaoQueueStatus = "" | "atrasado" | "retorno_hoje" | "novo" | "em_andamento";

export type ClientFilters = {
  city?: string;
  uf?: string;
  segment?: string;
  product_id?: number;
  bdr_user_id?: number;
  phone_availability?: "mobile" | "landline" | "none" | "";
  queue_status?: ProspeccaoQueueStatus;
  without_approach?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
  ids?: number[];
};

function buildClientFilterSql(filters: ClientFilters) {
  const where: string[] = ["1=1"];
  const params: Record<string, string | number | boolean> = {};

  if (filters.city) {
    where.push("lower(clients.city) = lower(@city)");
    params.city = filters.city;
  }
  if (filters.uf) {
    where.push("upper(clients.uf) = upper(@uf)");
    params.uf = filters.uf;
  }
  if (filters.segment) {
    where.push("lower(clients.segment) = lower(@segment)");
    params.segment = filters.segment;
  }
  if (filters.bdr_user_id) {
    where.push("clients.bdr_user_id = @bdrUserId");
    params.bdrUserId = filters.bdr_user_id;
  }
  if (filters.product_id) {
    where.push(
      `EXISTS (SELECT 1 FROM client_products cp WHERE cp.client_id = clients.id AND cp.product_id = @productId)`
    );
    params.productId = filters.product_id;
  }
  if (filters.without_approach) {
    where.push(`NOT EXISTS (SELECT 1 FROM approaches a WHERE a.client_id = clients.id)`);
  }
  if (filters.search) {
    where.push(
      `(clients.trade_name ILIKE @search OR clients.legal_name ILIKE @search OR clients.cnpj ILIKE @search)`
    );
    params.search = `%${filters.search}%`;
  }
  if (filters.ids?.length) {
    const safeIds = filters.ids.filter((id) => Number.isInteger(id)).join(",");
    if (safeIds) where.push(`clients.id IN (${safeIds})`);
  }

  return { where: where.join(" AND "), params };
}

type RawClientRow = {
  id: number;
  cnpj: string | null;
  legal_name: string | null;
  trade_name: string | null;
  segment: string | null;
  city: string | null;
  uf: string | null;
  bdr_user_id: number | null;
  bdr_name: string | null;
  phones: string | null;
  whatsapps: string | null;
  has_verified: boolean;
  product_ids: number[] | null;
  has_approach: boolean;
};

function classifyPhones(phonesRaw: string | null, whatsappsRaw: string | null) {
  const allDigits = `${phonesRaw ?? ""},${whatsappsRaw ?? ""}`
    .split(",")
    .map((p) => phoneDigits(p))
    .filter(Boolean);
  let hasMobile = false;
  let hasLandline = false;
  for (const d of allDigits) {
    if (isMobileBr(d)) hasMobile = true;
    else if (d.length >= 10) hasLandline = true;
  }
  return { hasMobile, hasLandline };
}

function mapRow(row: RawClientRow): ClientListItem {
  const { hasMobile, hasLandline } = classifyPhones(row.phones, row.whatsapps);
  return {
    id: row.id,
    cnpj: row.cnpj,
    legal_name: row.legal_name,
    trade_name: row.trade_name,
    segment: row.segment,
    city: row.city,
    uf: row.uf,
    bdr_user_id: row.bdr_user_id,
    bdr_name: row.bdr_name,
    has_mobile: hasMobile,
    has_landline: hasLandline,
    has_verified_phone: row.has_verified,
    product_ids: row.product_ids ?? [],
    has_approach: row.has_approach
  };
}

export function matchesPhoneFilter(item: ClientListItem, availability: ClientFilters["phone_availability"]) {
  if (!availability) return true;
  if (availability === "mobile") return item.has_mobile;
  if (availability === "landline") return item.has_landline && !item.has_mobile;
  if (availability === "none") return !item.has_mobile && !item.has_landline;
  return true;
}

export async function queryClients(filters: ClientFilters) {
  const { where, params } = buildClientFilterSql(filters);
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const rows = await all<RawClientRow>(
    `
      SELECT
        clients.id,
        clients.cnpj,
        clients.legal_name,
        clients.trade_name,
        clients.segment,
        clients.city,
        clients.uf,
        clients.bdr_user_id,
        bdr.name AS bdr_name,
        string_agg(DISTINCT contacts.phone, ',') AS phones,
        string_agg(DISTINCT contacts.whatsapp, ',') AS whatsapps,
        bool_or(contacts.verification_status = 'confirmed') AS has_verified,
        array_agg(DISTINCT cp.product_id) FILTER (WHERE cp.product_id IS NOT NULL) AS product_ids,
        EXISTS (SELECT 1 FROM approaches a WHERE a.client_id = clients.id) AS has_approach
      FROM clients
      LEFT JOIN users bdr ON bdr.id = clients.bdr_user_id
      LEFT JOIN contacts ON contacts.client_id = clients.id
      LEFT JOIN client_products cp ON cp.client_id = clients.id
      WHERE ${where}
      GROUP BY clients.id, bdr.name
      ORDER BY COALESCE(clients.trade_name, clients.legal_name, clients.id::text)
      LIMIT ${limit} OFFSET ${offset}
    `,
    params
  );

  const filtered = rows.map(mapRow).filter((item) => matchesPhoneFilter(item, filters.phone_availability));

  const countRow = await all<{ count: string }>(
    `
      SELECT COUNT(DISTINCT clients.id)::text AS count
      FROM clients
      LEFT JOIN contacts ON contacts.client_id = clients.id
      WHERE ${where}
    `,
    params
  );

  return {
    items: filtered,
    total: Number(countRow[0]?.count ?? 0)
  };
}

export async function queryAllMatchingClientIds(filters: ClientFilters) {
  const batchSize = 500;
  const ids: number[] = [];
  let offset = 0;
  for (;;) {
    const { items } = await queryClients({ ...filters, limit: batchSize, offset });
    if (!items.length) break;
    for (const item of items) {
      if (matchesPhoneFilter(item, filters.phone_availability)) ids.push(item.id);
    }
    if (items.length < batchSize) break;
    offset += batchSize;
  }
  return ids;
}
