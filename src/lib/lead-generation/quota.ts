import { get, run, nowIso } from "@/lib/db";
import { getGooglePlacesLimit } from "@/lib/google-places-settings";

export { isGoogleQuotaPauseMessage } from "@/lib/lead-generation/quota-messages";

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getDailyGoogleUsage(): Promise<number> {
  const day = todayUtcDate();
  const row = await get<{ google_calls: number }>(
    "SELECT google_calls FROM lead_generation_daily_usage WHERE usage_day = @day::date",
    { day }
  );
  return row?.google_calls ?? 0;
}

export async function incrementDailyGoogleUsage(delta: number): Promise<number> {
  const day = todayUtcDate();
  await run(
    `
      INSERT INTO lead_generation_daily_usage (usage_day, google_calls)
      VALUES (@day::date, @delta)
      ON CONFLICT (usage_day) DO UPDATE SET google_calls = lead_generation_daily_usage.google_calls + @delta
    `,
    { day, delta }
  );
  return getDailyGoogleUsage();
}

export async function canAttemptGoogleApi(attemptsInRun: number): Promise<{ ok: true } | { ok: false; error_message: string }> {
  const [dailyLimit, perRunLimit, dailyUsed] = await Promise.all([
    getGooglePlacesLimit("google_places_daily_limit"),
    getGooglePlacesLimit("google_places_per_run_limit"),
    getDailyGoogleUsage()
  ]);
  if (dailyUsed + 1 > dailyLimit) {
    return { ok: false, error_message: "Limite diário de consultas Google atingido." };
  }
  if (attemptsInRun + 1 > perRunLimit) {
    return { ok: false, error_message: "Limite de consultas Google por execução atingido." };
  }
  return { ok: true };
}

export async function recordGoogleApiAttempt(runId: number): Promise<void> {
  await incrementDailyGoogleUsage(1);
  await run(
    "UPDATE lead_generation_runs SET updated_at = @now WHERE id = @id",
    { id: runId, now: nowIso() }
  );
}

/** Resultado com sucesso (lead novo gravado com apoio Google) — usado no contador X/Y da execução. */
export async function recordGoogleSuccessResult(runId: number): Promise<void> {
  await run(
    "UPDATE lead_generation_runs SET google_calls_used = google_calls_used + 1, updated_at = @now WHERE id = @id",
    { id: runId, now: nowIso() }
  );
}

/** @deprecated Prefer canAttemptGoogleApi + recordGoogleApiAttempt / recordGoogleSuccessResult */
export async function canSpendGoogleCalls(runUsed: number, runMax: number, delta: number): Promise<boolean> {
  const dailyLimit = await getGooglePlacesLimit("google_places_daily_limit");
  const dailyUsed = await getDailyGoogleUsage();
  if (dailyUsed + delta > dailyLimit) return false;
  if (runUsed + delta > runMax) return false;
  return true;
}

/** @deprecated */
export async function touchRunGoogleUsage(runId: number, delta: number) {
  await run(
    "UPDATE lead_generation_runs SET google_calls_used = google_calls_used + @delta, updated_at = @now WHERE id = @id",
    { id: runId, delta, now: nowIso() }
  );
  await incrementDailyGoogleUsage(delta);
}
