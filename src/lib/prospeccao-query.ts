import { all } from "@/lib/db";
import { spDayEndUtcIso, spDayStartUtcIso } from "@/lib/datetime";
import { isMobileBr, phoneDigits } from "@/lib/format";
import type { ClientListItem } from "@/lib/types";
import type { ClientFilters } from "@/lib/clients-query";

type RawRow = {
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
  queue_priority: number;
  queue_label: string | null;
  next_follow_up_at: string | null;
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

function buildFilters(filters: ClientFilters) {
  const where: string[] = ["1=1"];
  const params: Record<string, string | number> = {};
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
    where.push(`EXISTS (SELECT 1 FROM client_products cp WHERE cp.client_id = clients.id AND cp.product_id = @productId)`);
    params.productId = filters.product_id;
  }
  if (filters.search) {
    where.push(`(clients.trade_name ILIKE @search OR clients.legal_name ILIKE @search OR clients.cnpj ILIKE @search)`);
    params.search = `%${filters.search}%`;
  }
  return { where: where.join(" AND "), params };
}

export type ProspeccaoListItem = ClientListItem & {
  queue_priority: number;
  queue_label: string | null;
};

export async function queryProspeccaoQueue(filters: ClientFilters) {
  const { where, params } = buildFilters(filters);
  const todayStart = spDayStartUtcIso();
  const todayEnd = spDayEndUtcIso();
  params.todayStart = todayStart;
  params.todayEnd = todayEnd;

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const rows = await all<RawRow>(
    `
      WITH pending_fu AS (
        SELECT DISTINCT ON (client_id)
          client_id,
          scheduled_at,
          CASE
            WHEN scheduled_at < @todayStart THEN 0
            WHEN scheduled_at <= @todayEnd THEN 1
            ELSE 2
          END AS fu_priority
        FROM follow_ups
        WHERE status = 'pending'
        ORDER BY client_id, scheduled_at ASC
      )
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
        EXISTS (SELECT 1 FROM approaches a WHERE a.client_id = clients.id) AS has_approach,
        COALESCE(pending_fu.fu_priority, CASE WHEN NOT EXISTS (SELECT 1 FROM approaches a2 WHERE a2.client_id = clients.id) THEN 3 ELSE 4 END) AS queue_priority,
        CASE
          WHEN pending_fu.fu_priority = 0 THEN 'Atrasado'
          WHEN pending_fu.fu_priority = 1 THEN 'Retorno para hoje'
          ELSE NULL
        END AS queue_label,
        pending_fu.scheduled_at AS next_follow_up_at
      FROM clients
      LEFT JOIN users bdr ON bdr.id = clients.bdr_user_id
      LEFT JOIN contacts ON contacts.client_id = clients.id
      LEFT JOIN client_products cp ON cp.client_id = clients.id
      LEFT JOIN pending_fu ON pending_fu.client_id = clients.id
      WHERE ${where}
        AND NOT EXISTS (
          SELECT 1 FROM opportunities o
          JOIN client_products cp2 ON cp2.client_id = clients.id AND cp2.product_id = o.product_id
          WHERE o.client_id = clients.id AND o.engagement_status = 'closed'
        )
      GROUP BY clients.id, bdr.name, pending_fu.fu_priority, pending_fu.scheduled_at
      ORDER BY queue_priority ASC, pending_fu.scheduled_at ASC NULLS LAST,
        COALESCE(clients.trade_name, clients.legal_name, clients.id::text)
      LIMIT ${limit} OFFSET ${offset}
    `,
    params
  );

  const items: ProspeccaoListItem[] = rows.map((row) => {
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
      has_approach: row.has_approach,
      queue_priority: row.queue_priority,
      queue_label: row.queue_label
    };
  });

  const countRow = await all<{ count: string }>(
    `SELECT COUNT(DISTINCT clients.id)::text AS count FROM clients WHERE ${where}`,
    params
  );

  return { items, total: Number(countRow[0]?.count ?? 0) };
}
