import { get, nowIso, run } from "@/lib/db";

export type CallStrategySettings = {
  max_no_answer_attempts: number;
  max_invalid_attempts: number;
  max_wrong_number_attempts: number;
  min_interval_minutes: number;
  round_interval_hours: number;
};

export type AttemptBucket =
  | "no_answer"
  | "invalid"
  | "wrong_number"
  | "technical_fail"
  | "conversation_success"
  | "unknown";

const DEFAULTS: CallStrategySettings = {
  max_no_answer_attempts: 3,
  max_invalid_attempts: 3,
  max_wrong_number_attempts: 3,
  min_interval_minutes: 60,
  round_interval_hours: 24
};

export async function getCallStrategySettings(): Promise<CallStrategySettings> {
  const row = await get<CallStrategySettings>(
    `
      SELECT max_no_answer_attempts, max_invalid_attempts, max_wrong_number_attempts,
        min_interval_minutes, round_interval_hours
      FROM call_strategy_settings WHERE id = 1
    `
  );
  return row ? { ...DEFAULTS, ...row } : DEFAULTS;
}

export async function updateCallStrategySettings(input: Partial<CallStrategySettings>): Promise<void> {
  const cur = await getCallStrategySettings();
  const next = { ...cur, ...input };
  await run(
    `
      INSERT INTO call_strategy_settings (
        id, max_no_answer_attempts, max_invalid_attempts, max_wrong_number_attempts,
        min_interval_minutes, round_interval_hours, updated_at
      ) VALUES (
        1, @maxNoAnswer, @maxInvalid, @maxWrong, @minInterval, @roundHours, @now
      )
      ON CONFLICT (id) DO UPDATE SET
        max_no_answer_attempts = EXCLUDED.max_no_answer_attempts,
        max_invalid_attempts = EXCLUDED.max_invalid_attempts,
        max_wrong_number_attempts = EXCLUDED.max_wrong_number_attempts,
        min_interval_minutes = EXCLUDED.min_interval_minutes,
        round_interval_hours = EXCLUDED.round_interval_hours,
        updated_at = EXCLUDED.updated_at
    `,
    {
      maxNoAnswer: next.max_no_answer_attempts,
      maxInvalid: next.max_invalid_attempts,
      maxWrong: next.max_wrong_number_attempts,
      minInterval: next.min_interval_minutes,
      roundHours: next.round_interval_hours,
      now: nowIso()
    }
  );
}

export type ResultRuleRow = {
  id: number;
  bucket: AttemptBucket;
  technical_slug: string | null;
  commercial_slug: string | null;
  contact_outcome_slug: string | null;
  consumes_attempt: boolean;
  sort_order: number;
  status: string;
};

export async function listCallStrategyResultRules(): Promise<ResultRuleRow[]> {
  const { all } = await import("@/lib/db");
  return all<ResultRuleRow>(
    `
      SELECT id, bucket, technical_slug, commercial_slug, contact_outcome_slug,
        consumes_attempt, sort_order, status
      FROM call_strategy_result_rules
      ORDER BY sort_order, id
    `
  );
}

export async function resolveAttemptBucket(input: {
  technical_slug: string | null;
  commercial_slug: string | null;
  contact_outcome_slug: string | null;
}): Promise<{ bucket: AttemptBucket; consumes: boolean }> {
  const rules = (await listCallStrategyResultRules())
    .filter((r) => r.status === "active")
    .slice()
    .sort((a, b) => {
      const spec = (r: ResultRuleRow) =>
        (r.technical_slug ? 1 : 0) + (r.commercial_slug ? 1 : 0) + (r.contact_outcome_slug ? 1 : 0);
      const d = spec(b) - spec(a);
      if (d !== 0) return d;
      return a.sort_order - b.sort_order;
    });
  for (const r of rules) {
    if (r.technical_slug && r.technical_slug !== input.technical_slug) continue;
    if (r.commercial_slug && r.commercial_slug !== input.commercial_slug) continue;
    if (r.contact_outcome_slug && r.contact_outcome_slug !== input.contact_outcome_slug) continue;
    if (!r.technical_slug && !r.commercial_slug && !r.contact_outcome_slug) continue;
    return { bucket: r.bucket, consumes: r.consumes_attempt };
  }
  if (input.technical_slug === "call_failed") {
    return { bucket: "technical_fail", consumes: false };
  }
  if (input.technical_slug === "invalid_number") {
    return { bucket: "invalid", consumes: true };
  }
  if (input.technical_slug === "no_answer" || input.technical_slug === "busy") {
    return { bucket: "no_answer", consumes: true };
  }
  if (
    input.contact_outcome_slug === "falou_outra_pessoa" &&
    (input.commercial_slug === "sem_contato" || input.commercial_slug == null)
  ) {
    return { bucket: "wrong_number", consumes: true };
  }
  if (input.technical_slug === "answered") {
    if (input.contact_outcome_slug === "nenhum_contato") {
      return { bucket: "no_answer", consumes: true };
    }
    return { bucket: "conversation_success", consumes: false };
  }
  return { bucket: "unknown", consumes: false };
}
