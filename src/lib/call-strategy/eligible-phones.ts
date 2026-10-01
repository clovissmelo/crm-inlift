import { all } from "@/lib/db";
import { normalizeApi4comCalledNumber } from "@/lib/api4com/phone";
import {
  getCallStrategySettings,
  type CallStrategySettings
} from "@/lib/call-strategy/settings";
import {
  listClientPhonesWithState,
  isPhoneEligibleNow,
  phoneAttemptLabel,
  type ClientPhoneRow
} from "@/lib/call-strategy/client-phones";
import { formatContactOrigin } from "@/lib/contact-origin";
import { listResultRegistrationAssociations } from "@/lib/classifications/result-associations";
import {
  buildCounterLines,
  getGlobalLimitForKind,
  readCountForKind,
  type PhoneCounterState
} from "@/lib/call-strategy/phone-counters";
import { formatCounterLine, type OccurrenceKind } from "@/lib/call-strategy/occurrence-policy-shared";

export type PhoneDialContextItem = {
  client_phone_id: number;
  phone: string;
  phone_display: string;
  origin: string;
  sort_order: number;
  position: number;
  total: number;
  status: string;
  attempt_label: string;
  cycle_no_answer_count: number;
  cycle_invalid_count: number;
  cycle_wrong_number_count: number;
  next_eligible_at: string | null;
  last_attempt_at: string | null;
  last_bucket: string | null;
  last_commercial_slug: string | null;
  eligible_now: boolean;
  primary_contact_id: number | null;
  counter_line: string | null;
  counter_lines: string[];
  needs_review: boolean;
};

export type ClientDialStrategySummary = {
  phones: PhoneDialContextItem[];
  suggested: PhoneDialContextItem | null;
  waiting_next_at: string | null;
  lead_status: "sem_telefone" | "aguardando_intervalo" | "numeros_disponiveis" | "esgotado";
  phone_summary: string;
  current_counter_line: string | null;
};

async function loadLimitsByKind(): Promise<Partial<Record<OccurrenceKind, number>>> {
  const associations = await listResultRegistrationAssociations({ status: "active" }).catch(() => []);
  const limits: Partial<Record<OccurrenceKind, number>> = {};
  for (const a of associations) {
    if (!a.dial_counts_for_exhaustion || !a.dial_occurrence_kind) continue;
    const kind = a.dial_occurrence_kind as OccurrenceKind;
    const lim = a.dial_occurrence_limit ?? (await getGlobalLimitForKind(kind));
    limits[kind] = limits[kind] != null ? Math.min(limits[kind]!, lim) : lim;
  }
  for (const kind of ["no_contact", "invalid", "wrong_number"] as OccurrenceKind[]) {
    if (limits[kind] == null) limits[kind] = await getGlobalLimitForKind(kind);
  }
  if (limits.no_contact == null) {
    limits.no_contact = await getGlobalLimitForKind("no_contact");
  }
  return limits;
}

async function loadLastAttempts(clientId: number): Promise<
  Map<
    number,
    { created_at: string; attempt_bucket: string; commercial_slug: string | null }
  >
> {
  const rows = await all<{
    client_phone_id: number;
    created_at: string;
    attempt_bucket: string;
    commercial_slug: string | null;
  }>(
    `
      SELECT DISTINCT ON (client_phone_id)
        client_phone_id, created_at, attempt_bucket, commercial_slug
      FROM phone_dial_attempts
      WHERE client_id = @clientId
      ORDER BY client_phone_id, created_at DESC
    `,
    { clientId }
  );
  const map = new Map<number, { created_at: string; attempt_bucket: string; commercial_slug: string | null }>();
  for (const r of rows) map.set(r.client_phone_id, r);
  return map;
}

function pickSuggested(
  phones: PhoneDialContextItem[],
  _settings: CallStrategySettings,
  currentDigits: string | null
): PhoneDialContextItem | null {
  const eligible = phones.filter((p) => p.eligible_now && p.status !== "exhausted");
  if (eligible.length === 0) return null;

  const untried = eligible.filter(
    (p) => p.cycle_no_answer_count + p.cycle_invalid_count + p.cycle_wrong_number_count === 0
  );
  const pool = untried.length > 0 ? untried : eligible;
  pool.sort((a, b) => a.sort_order - b.sort_order || a.client_phone_id - b.client_phone_id);

  if (currentDigits) {
    const cur = pool.find((p) => normalizeApi4comCalledNumber(p.phone) === currentDigits);
    if (cur) {
      const idx = pool.indexOf(cur);
      return pool[idx + 1] ?? pool.find((p) => p.client_phone_id !== cur.client_phone_id) ?? null;
    }
  }
  return pool[0] ?? null;
}

export async function buildClientDialStrategySummary(input: {
  clientId: number;
  currentPhoneDialed?: string | null;
}): Promise<ClientDialStrategySummary> {
  const settings = await getCallStrategySettings();
  const limitsByKind = await loadLimitsByKind();
  const rawPhones = await listClientPhonesWithState(input.clientId);
  const lastMap = await loadLastAttempts(input.clientId);
  const total = rawPhones.length;
  const now = Date.now();

  if (total === 0) {
    return {
      phones: [],
      suggested: null,
      waiting_next_at: null,
      lead_status: "sem_telefone",
      phone_summary: "Sem telefone",
      current_counter_line: null
    };
  }

  const phones: PhoneDialContextItem[] = rawPhones.map((p: ClientPhoneRow, idx) => {
    const last = lastMap.get(p.id);
    const eligible = isPhoneEligibleNow(p, settings, now) && p.status !== "exhausted";
    const counterState: PhoneCounterState = {
      cycle_no_contact_count: p.cycle_no_contact_count,
      cycle_no_answer_count: p.cycle_no_answer_count,
      cycle_invalid_count: p.cycle_invalid_count,
      cycle_wrong_number_count: p.cycle_wrong_number_count,
      status: p.status,
      needs_review: p.needs_review,
      last_occurrence_kind: p.last_occurrence_kind
    };
    const counter_lines = buildCounterLines(counterState, limitsByKind);
    const primaryKind =
      (p.last_occurrence_kind as OccurrenceKind | null) ??
      (last?.attempt_bucket as OccurrenceKind | null) ??
      "no_contact";
    const primaryCount = readCountForKind(counterState, primaryKind);
    const primaryLimit = limitsByKind[primaryKind] ?? 3;
    const counter_line =
      primaryKind === "conversation_success" || primaryKind === "technical_fail"
        ? null
        : formatCounterLine(primaryKind, primaryCount, primaryLimit);
    return {
      client_phone_id: p.id,
      phone: p.phone_digits,
      phone_display: p.display_phone ?? p.phone_digits,
      origin: formatContactOrigin(p.origin),
      sort_order: p.sort_order,
      position: idx + 1,
      total,
      status: p.status,
      attempt_label: phoneAttemptLabel(p, settings),
      cycle_no_answer_count: p.cycle_no_answer_count,
      cycle_invalid_count: p.cycle_invalid_count,
      cycle_wrong_number_count: p.cycle_wrong_number_count,
      next_eligible_at: p.next_eligible_at,
      last_attempt_at: last?.created_at ?? null,
      last_bucket: last?.attempt_bucket ?? null,
      last_commercial_slug: last?.commercial_slug ?? null,
      eligible_now: eligible,
      primary_contact_id: p.primary_contact_id,
      counter_line,
      counter_lines,
      needs_review: p.needs_review
    };
  });

  const currentDigits = input.currentPhoneDialed
    ? normalizeApi4comCalledNumber(input.currentPhoneDialed)
    : null;
  const suggested = pickSuggested(phones, settings, currentDigits);

  let waitingNext: string | null = null;
  for (const p of phones) {
    if (p.status === "exhausted") continue;
    if (p.next_eligible_at) {
      const t = new Date(p.next_eligible_at).getTime();
      if (t > now && (!waitingNext || t < new Date(waitingNext).getTime())) {
        waitingNext = p.next_eligible_at;
      }
    }
  }

  const anyEligible = phones.some((p) => p.eligible_now);
  const allExhausted = phones.every((p) => p.status === "exhausted");
  let lead_status: ClientDialStrategySummary["lead_status"] = "numeros_disponiveis";
  if (allExhausted) lead_status = "esgotado";
  else if (!anyEligible && waitingNext) lead_status = "aguardando_intervalo";

  const tried = phones.filter(
    (p) => p.cycle_no_answer_count + p.cycle_invalid_count + p.cycle_wrong_number_count > 0
  ).length;
  const phone_summary = `${tried} de ${total} número${total === 1 ? "" : "s"} tentados`;

  const currentDigits2 = input.currentPhoneDialed
    ? normalizeApi4comCalledNumber(input.currentPhoneDialed)
    : null;
  const currentPhone = currentDigits2
    ? phones.find((p) => p.phone === currentDigits2)
    : phones[0];
  return {
    phones,
    suggested,
    waiting_next_at: waitingNext,
    lead_status,
    phone_summary,
    current_counter_line: currentPhone?.counter_line ?? null
  };
}
