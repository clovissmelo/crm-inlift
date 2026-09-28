import { get, run, nowIso } from "@/lib/db";
import { getGooglePlacesLimit } from "@/lib/google-places-settings";

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

export async function canSpendGoogleCalls(runUsed: number, runMax: number, delta: number): Promise<boolean> {
  const dailyLimit = await getGooglePlacesLimit("google_places_daily_limit");
  const dailyUsed = await getDailyGoogleUsage();
  if (dailyUsed + delta > dailyLimit) return false;
  if (runUsed + delta > runMax) return false;
  return true;
}

export async function touchRunGoogleUsage(runId: number, delta: number) {
  await run(
    "UPDATE lead_generation_runs SET google_calls_used = google_calls_used + @delta, updated_at = @now WHERE id = @id",
    { id: runId, delta, now: nowIso() }
  );
  await incrementDailyGoogleUsage(delta);
}
