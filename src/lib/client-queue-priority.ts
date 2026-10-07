import { all } from "@/lib/db";
import { spDayStartUtcIso } from "@/lib/datetime";
import { isMobileBr, phoneDigits } from "@/lib/format";
import type { ClientListItem } from "@/lib/types";
import { listProspeccaoPriorityTypes } from "@/lib/call-strategy/priorities-config";
import { resolveQueuePriorityForClient } from "@/lib/call-strategy/resolve-queue-priority";

export type ClientQueuePriorityFields = {
  queue_slug: string;
  queue_label: string | null;
  queue_color: string | null;
  queue_overdue_alert: boolean;
};

export type ClientListItemWithQueue = ClientListItem & ClientQueuePriorityFields;

function contactHasPhoneKinds(phonesRaw: string | null, whatsappsRaw: string | null) {
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

/** Resolve prioridade operacional da fila para uma página de clientes. */
export async function enrichClientsWithQueuePriority(
  items: ClientListItem[]
): Promise<ClientListItemWithQueue[]> {
  if (items.length === 0) return [];

  const ids = items.map((i) => i.id);
  const idsPg = `{${ids.join(",")}}`;
  const todayStart = spDayStartUtcIso();
  const nowIso = new Date().toISOString();
  const priorityTypes = await listProspeccaoPriorityTypes();

  const rows = await all<{
    id: number;
    has_approach: boolean;
    completed_dial_rounds: number;
    dial_attempt_count: number;
    phone_count: number;
    phones: string | null;
    whatsapps: string | null;
    pending_return_at: string | null;
    return_overdue: boolean;
    warm_screen_confirmed_at: string | null;
  }>(
    `
      WITH pending_fu AS (
        SELECT DISTINCT ON (client_id)
          client_id,
          scheduled_at
        FROM follow_ups
        WHERE status = 'pending' AND scheduled_at <= @nowIso
          AND client_id = ANY(@ids::int[])
        ORDER BY client_id, scheduled_at ASC
      )
      SELECT
        c.id,
        EXISTS (SELECT 1 FROM approaches a WHERE a.client_id = c.id) AS has_approach,
        COALESCE(c.prospeccao_completed_dial_rounds, 0) AS completed_dial_rounds,
        (SELECT COUNT(*)::int FROM phone_dial_attempts pda WHERE pda.client_id = c.id) AS dial_attempt_count,
        (SELECT COUNT(*)::int FROM client_phones cph WHERE cph.client_id = c.id) AS phone_count,
        string_agg(DISTINCT ct.phone, ',') AS phones,
        string_agg(DISTINCT ct.whatsapp, ',') AS whatsapps,
        pending_fu.scheduled_at AS pending_return_at,
        (pending_fu.scheduled_at IS NOT NULL AND pending_fu.scheduled_at < @todayStart) AS return_overdue,
        c.warm_screen_confirmed_at
      FROM clients c
      LEFT JOIN contacts ct ON ct.client_id = c.id
      LEFT JOIN pending_fu ON pending_fu.client_id = c.id
      WHERE c.id = ANY(@ids::int[])
      GROUP BY c.id, pending_fu.scheduled_at, c.prospeccao_completed_dial_rounds, c.warm_screen_confirmed_at
    `,
    { ids: idsPg, nowIso, todayStart }
  );

  const byId = new Map(rows.map((r) => [r.id, r]));

  return items.map((item) => {
    const row = byId.get(item.id);
    if (!row) {
      return {
        ...item,
        queue_slug: "primeiro_contato",
        queue_label: "Primeiro contato",
        queue_color: "#64748b",
        queue_overdue_alert: false
      };
    }
    const kinds = contactHasPhoneKinds(row.phones, row.whatsapps);
    const resolved = resolveQueuePriorityForClient(
      {
        hasApproach: row.has_approach,
        hasPhones: row.phone_count > 0 || kinds.hasMobile || kinds.hasLandline,
        hasAnyDialAttempt: row.dial_attempt_count > 0,
        completedDialRounds: row.completed_dial_rounds,
        pendingReturnAt: row.pending_return_at,
        returnOverdue: row.return_overdue,
        warmScreenConfirmed: Boolean(row.warm_screen_confirmed_at)
      },
      priorityTypes
    );
    return {
      ...item,
      queue_slug: resolved.slug,
      queue_label: resolved.name,
      queue_color: resolved.color,
      queue_overdue_alert: resolved.overdueAlert
    };
  });
}
