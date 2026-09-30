import { all } from "@/lib/db";
import { inferApproachResultSlugFromCall } from "@/lib/api4com/infer-approach-result";
import { phoneDigits } from "@/lib/format";

export type ContactLastCallAttempt = {
  occurred_at: string;
  result_label: string;
};

type ApiCallRow = {
  contact_id: number | null;
  phone_dialed: string;
  occurred_at: string;
  status: string;
  error_message: string | null;
  result_name: string | null;
  hangup_cause_code: string | null;
  hangup_cause_label: string | null;
  duration_seconds: number | null;
  answered_at: string | null;
};

type ManualCallRow = {
  contact_id: number;
  occurred_at: string;
  result_name: string | null;
};

function pickLatest(
  map: Map<number, ContactLastCallAttempt>,
  contactId: number,
  occurred_at: string,
  result_label: string
) {
  const label = result_label.trim() || "Sem resultado";
  const prev = map.get(contactId);
  if (!prev || new Date(occurred_at).getTime() > new Date(prev.occurred_at).getTime()) {
    map.set(contactId, { occurred_at, result_label: label });
  }
}

function resultLabelForApiCall(
  row: ApiCallRow,
  inferredNames: Map<string, string>
): string | null {
  if (row.result_name?.trim()) return row.result_name.trim();
  if (row.status === "failed") {
    return row.error_message?.trim() || "Falha na discagem";
  }
  if (row.status !== "completed") return null;

  const slug = inferApproachResultSlugFromCall({
    hangup_cause_code: row.hangup_cause_code,
    hangup_cause_label: row.hangup_cause_label,
    duration_seconds: row.duration_seconds,
    answered_at: row.answered_at
  });
  if (slug && inferredNames.has(slug)) return inferredNames.get(slug)!;
  if (row.hangup_cause_label?.trim()) return row.hangup_cause_label.trim();
  return "Sem resultado registrado";
}

/** Última tentativa de ligação (API4COM ou abordagem manual) por contato do cliente. */
export async function getLastCallAttemptsByContactId(clientId: number): Promise<Map<number, ContactLastCallAttempt>> {
  const inferredRows = await all<{ slug: string; name: string }>(
    `
      SELECT slug, name FROM approach_result_types
      WHERE slug IN ('nao_atendeu', 'chamou_sem_resposta', 'numero_invalido')
    `
  );
  const inferredNames = new Map(inferredRows.map((r) => [r.slug, r.name]));

  const apiCalls = await all<ApiCallRow>(
    `
      SELECT
        c.contact_id,
        c.phone_dialed,
        COALESCE(c.ended_at, c.started_at, c.created_at) AS occurred_at,
        c.status,
        c.error_message,
        COALESCE(a.commercial_result_name_snapshot, rt.name) AS result_name,
        c.hangup_cause_code,
        c.hangup_cause_label,
        c.duration_seconds,
        c.answered_at
      FROM api4com_calls c
      LEFT JOIN approaches a ON a.id = c.approach_id
      LEFT JOIN approach_result_types rt ON rt.id = a.result_type_id
      WHERE c.client_id = @clientId
        AND c.status IN ('initiating', 'ringing', 'in_progress', 'completed', 'failed')
      ORDER BY COALESCE(c.ended_at, c.started_at, c.created_at) DESC
    `,
    { clientId }
  );

  const manualCalls = await all<ManualCallRow>(
    `
      SELECT a.contact_id, a.occurred_at, COALESCE(a.commercial_result_name_snapshot, rt.name) AS result_name
      FROM approaches a
      LEFT JOIN approach_result_types rt ON rt.id = a.result_type_id
      WHERE a.client_id = @clientId
        AND a.channel = 'call'
        AND a.contact_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM api4com_calls ac WHERE ac.approach_id = a.id)
      ORDER BY a.occurred_at DESC
    `,
    { clientId }
  );

  const contacts = await all<{ id: number; phone: string | null; whatsapp: string | null }>(
    "SELECT id, phone, whatsapp FROM contacts WHERE client_id = @clientId",
    { clientId }
  );

  const phoneToContactIds = new Map<string, number[]>();
  for (const c of contacts) {
    for (const raw of [c.phone, c.whatsapp]) {
      const d = phoneDigits(raw);
      if (!d) continue;
      const list = phoneToContactIds.get(d) ?? [];
      if (!list.includes(c.id)) list.push(c.id);
      phoneToContactIds.set(d, list);
    }
  }

  const map = new Map<number, ContactLastCallAttempt>();

  for (const row of apiCalls) {
    const label = resultLabelForApiCall(row, inferredNames);
    if (!label) continue;

    if (row.contact_id != null) {
      pickLatest(map, row.contact_id, row.occurred_at, label);
      continue;
    }

    const dialed = phoneDigits(row.phone_dialed);
    const ids = phoneToContactIds.get(dialed);
    if (!ids?.length) continue;
    for (const contactId of ids) {
      pickLatest(map, contactId, row.occurred_at, label);
    }
  }

  for (const row of manualCalls) {
    pickLatest(map, row.contact_id, row.occurred_at, row.result_name?.trim() || "Sem resultado");
  }

  return map;
}

export function contactLastCallMapToRecord(map: Map<number, ContactLastCallAttempt>): Record<number, ContactLastCallAttempt> {
  return Object.fromEntries(map.entries());
}
