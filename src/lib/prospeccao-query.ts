import { all } from "@/lib/db";
import { spDayEndUtcIso, spDayStartUtcIso } from "@/lib/datetime";
import { isMobileBr, phoneDigits } from "@/lib/format";
import type { ClientListItem } from "@/lib/types";
import { matchesPhoneFilter } from "@/lib/clients-query";
import type { ClientFilters } from "@/lib/clients-query";
import { CONTACT_PRIMARY_ORDER_SQL } from "@/lib/contacts";
import { parseLeadQualification } from "@/lib/lead-qualification";
import { listProspeccaoPriorityTypes } from "@/lib/call-strategy/priorities-config";
import {
  compareResolvedQueuePriority,
  resolveQueuePriorityForClient,
  type ResolvedQueuePriority
} from "@/lib/call-strategy/resolve-queue-priority";

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
  lead_qualification: string;
  phones: string | null;
  whatsapps: string | null;
  primary_phone: string | null;
  primary_whatsapp: string | null;
  primary_email: string | null;
  primary_contact_name: string | null;
  primary_contact_id: number | null;
  has_verified: boolean;
  product_ids: number[] | null;
  has_approach: boolean;
  completed_dial_rounds: number;
  dial_attempt_count: number;
  phone_count: number;
  pending_return_at: string | null;
  return_overdue: boolean;
  prospeccao_phone_summary: string | null;
};

function contactPhoneDigits(phonesRaw: string | null, whatsappsRaw: string | null): string[] {
  const unique = new Set<string>();
  for (const part of `${phonesRaw ?? ""},${whatsappsRaw ?? ""}`.split(",")) {
    const d = phoneDigits(part);
    if (d) unique.add(d);
  }
  return [...unique];
}

function countContactPhones(phonesRaw: string | null, whatsappsRaw: string | null): number {
  return contactPhoneDigits(phonesRaw, whatsappsRaw).length;
}

function classifyPhones(phonesRaw: string | null, whatsappsRaw: string | null) {
  const allDigits = contactPhoneDigits(phonesRaw, whatsappsRaw);
  let hasMobile = false;
  let hasLandline = false;
  for (const d of allDigits) {
    if (isMobileBr(d)) hasMobile = true;
    else if (d.length >= 10) hasLandline = true;
  }
  return { hasMobile, hasLandline };
}

function buildFilters(filters: ClientFilters, todayStart: string, todayEnd: string, nowIso: string) {
  const where: string[] = [
    "1=1",
    `(
      clients.in_prospeccao_queue = true
      OR EXISTS (
        SELECT 1 FROM client_product_prospeccao cpp
        WHERE cpp.client_id = clients.id AND cpp.in_prospeccao_queue = true
      )
    )`,
    `NOT (
      EXISTS (
        SELECT 1 FROM follow_ups fu
        WHERE fu.client_id = clients.id AND fu.status = 'pending' AND fu.scheduled_at > @nowIso
      )
      AND NOT EXISTS (
        SELECT 1 FROM follow_ups fu2
        WHERE fu2.client_id = clients.id AND fu2.status = 'pending' AND fu2.scheduled_at <= @nowIso
      )
    )`
  ];
  const params: Record<string, string | number> = { todayStart, todayEnd, nowIso };
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
  if (filters.company_id) {
    where.push(`
      EXISTS (
        SELECT 1 FROM client_products cp
        JOIN products p ON p.id = cp.product_id
        WHERE cp.client_id = clients.id AND p.company_id = @companyId
      )
    `);
    params.companyId = filters.company_id;
  }
  if (filters.search) {
    where.push(`(clients.trade_name ILIKE @search OR clients.legal_name ILIKE @search OR clients.cnpj ILIKE @search)`);
    params.search = `%${filters.search}%`;
  }
  if (filters.lead_qualification) {
    where.push("clients.lead_qualification = @leadQualification");
    params.leadQualification = filters.lead_qualification;
  }
  if (filters.queue_status === "atrasado") {
    where.push(`EXISTS (
      SELECT 1 FROM follow_ups fu
      WHERE fu.client_id = clients.id AND fu.status = 'pending'
        AND fu.scheduled_at < @todayStart
    )`);
  } else if (filters.queue_status === "retorno_hoje") {
    where.push(`EXISTS (
      SELECT 1 FROM follow_ups fu
      WHERE fu.client_id = clients.id AND fu.status = 'pending'
        AND fu.scheduled_at >= @todayStart AND fu.scheduled_at <= @todayEnd
    )`);
  } else if (filters.queue_status === "novo") {
    where.push(`NOT EXISTS (SELECT 1 FROM approaches a WHERE a.client_id = clients.id)`);
  } else if (filters.queue_status === "em_andamento") {
    where.push(`EXISTS (SELECT 1 FROM approaches a WHERE a.client_id = clients.id)`);
  }
  return { where: where.join(" AND "), params };
}

export type ProspeccaoListItem = ClientListItem & {
  queue_slug: string;
  queue_label: string | null;
  queue_color: string | null;
  queue_overdue_alert: boolean;
  queue_sort_order: number;
  /** @deprecated use queue_sort_order */
  queue_priority: number;
  prospeccao_phone_summary: string | null;
  /** Telefones distintos nos contatos (phone + whatsapp). */
  contact_phone_count: number;
  primary_phone: string | null;
  primary_whatsapp: string | null;
  primary_email: string | null;
  primary_contact_name: string | null;
  primary_contact_id: number | null;
  next_follow_up_at: string | null;
};

type EnrichedRow = RawRow & { resolved: ResolvedQueuePriority; next_follow_up_at: string | null };

export async function queryProspeccaoQueue(filters: ClientFilters) {
  const todayStart = spDayStartUtcIso();
  const todayEnd = spDayEndUtcIso();
  const nowIso = new Date().toISOString();
  const { where, params } = buildFilters(filters, todayStart, todayEnd, nowIso);
  const priorityTypes = await listProspeccaoPriorityTypes();

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const rows = await all<RawRow>(
    `
      WITH pending_fu AS (
        SELECT DISTINCT ON (client_id)
          client_id,
          scheduled_at
        FROM follow_ups
        WHERE status = 'pending' AND scheduled_at <= @nowIso
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
        clients.lead_qualification,
        bdr.name AS bdr_name,
        string_agg(DISTINCT contacts.phone, ',') AS phones,
        string_agg(DISTINCT contacts.whatsapp, ',') AS whatsapps,
        (
          SELECT c.phone FROM contacts c
          WHERE c.client_id = clients.id AND NULLIF(trim(c.phone), '') IS NOT NULL
          ORDER BY ${CONTACT_PRIMARY_ORDER_SQL} LIMIT 1
        ) AS primary_phone,
        (
          SELECT COALESCE(NULLIF(trim(c.whatsapp), ''), NULLIF(trim(c.phone), ''))
          FROM contacts c WHERE c.client_id = clients.id
            AND (NULLIF(trim(c.whatsapp), '') IS NOT NULL OR NULLIF(trim(c.phone), '') IS NOT NULL)
          ORDER BY ${CONTACT_PRIMARY_ORDER_SQL} LIMIT 1
        ) AS primary_whatsapp,
        (
          SELECT c.email FROM contacts c
          WHERE c.client_id = clients.id AND NULLIF(trim(c.email), '') IS NOT NULL
          ORDER BY ${CONTACT_PRIMARY_ORDER_SQL} LIMIT 1
        ) AS primary_email,
        (
          SELECT c.name FROM contacts c WHERE c.client_id = clients.id ORDER BY ${CONTACT_PRIMARY_ORDER_SQL} LIMIT 1
        ) AS primary_contact_name,
        (
          SELECT c.id FROM contacts c WHERE c.client_id = clients.id ORDER BY ${CONTACT_PRIMARY_ORDER_SQL} LIMIT 1
        ) AS primary_contact_id,
        bool_or(contacts.verification_status = 'confirmed') AS has_verified,
        array_agg(DISTINCT cp.product_id) FILTER (WHERE cp.product_id IS NOT NULL) AS product_ids,
        EXISTS (SELECT 1 FROM approaches a WHERE a.client_id = clients.id) AS has_approach,
        COALESCE(clients.prospeccao_completed_dial_rounds, 0) AS completed_dial_rounds,
        (
          SELECT COUNT(*)::int FROM phone_dial_attempts pda WHERE pda.client_id = clients.id
        ) AS dial_attempt_count,
        (
          SELECT COUNT(*)::int FROM client_phones cph WHERE cph.client_id = clients.id
        ) AS phone_count,
        pending_fu.scheduled_at AS pending_return_at,
        (pending_fu.scheduled_at IS NOT NULL AND pending_fu.scheduled_at < @todayStart) AS return_overdue,
        clients.prospeccao_phone_summary
      FROM clients
      LEFT JOIN users bdr ON bdr.id = clients.bdr_user_id
      LEFT JOIN contacts ON contacts.client_id = clients.id
      LEFT JOIN client_products cp ON cp.client_id = clients.id
      LEFT JOIN pending_fu ON pending_fu.client_id = clients.id
      WHERE ${where}
      GROUP BY clients.id, bdr.name, pending_fu.scheduled_at, clients.prospeccao_phone_summary,
        clients.prospeccao_completed_dial_rounds
    `,
    params
  );

  const enriched: EnrichedRow[] = rows.map((row) => {
    const phoneKinds = classifyPhones(row.phones, row.whatsapps);
    const resolved = resolveQueuePriorityForClient(
      {
        hasApproach: row.has_approach,
        hasPhones: row.phone_count > 0 || phoneKinds.hasMobile || phoneKinds.hasLandline,
        hasAnyDialAttempt: row.dial_attempt_count > 0,
        completedDialRounds: row.completed_dial_rounds,
        pendingReturnAt: row.pending_return_at,
        returnOverdue: row.return_overdue
      },
      priorityTypes
    );
    return {
      ...row,
      resolved,
      next_follow_up_at: row.pending_return_at
    };
  });

  let filtered = enriched;
  if (filters.prioridade) {
    filtered = filtered.filter((r) => r.resolved.slug === filters.prioridade);
  }
  if (filters.phone_availability) {
    filtered = filtered.filter((row) => {
      const { hasMobile, hasLandline } = classifyPhones(row.phones, row.whatsapps);
      return matchesPhoneFilter(
        { has_mobile: hasMobile, has_landline: hasLandline } as ClientListItem,
        filters.phone_availability
      );
    });
  }

  filtered.sort((a, b) => {
    const cmp = compareResolvedQueuePriority(
      a.resolved,
      b.resolved,
      a.next_follow_up_at,
      b.next_follow_up_at
    );
    if (cmp !== 0) return cmp;
    return (a.trade_name ?? a.legal_name ?? String(a.id)).localeCompare(
      b.trade_name ?? b.legal_name ?? String(b.id)
    );
  });

  const page = filtered.slice(offset, offset + limit);

  const items: ProspeccaoListItem[] = page.map((row) => {
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
      lead_qualification: parseLeadQualification(row.lead_qualification),
      has_mobile: hasMobile,
      has_landline: hasLandline,
      has_verified_phone: row.has_verified,
      product_ids: row.product_ids ?? [],
      has_approach: row.has_approach,
      queue_slug: row.resolved.slug,
      queue_label: row.resolved.name,
      queue_color: row.resolved.color,
      queue_overdue_alert: row.resolved.overdueAlert,
      queue_sort_order: row.resolved.effectiveSortOrder,
      queue_priority: row.resolved.effectiveSortOrder,
      prospeccao_phone_summary: row.prospeccao_phone_summary,
      contact_phone_count: countContactPhones(row.phones, row.whatsapps),
      primary_phone: row.primary_phone,
      primary_whatsapp: row.primary_whatsapp,
      primary_email: row.primary_email,
      primary_contact_name: row.primary_contact_name,
      primary_contact_id: row.primary_contact_id,
      next_follow_up_at: row.next_follow_up_at
    };
  });

  return { items, total: filtered.length };
}
