import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { getDailyGoogleUsage } from "@/lib/lead-generation/quota";
import { getGooglePlacesApiKey, getGooglePlacesLimit } from "@/lib/google-places-settings";

export async function GET() {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;

  const [dailyLimit, perRunLimit, usedToday, hasKey] = await Promise.all([
    getGooglePlacesLimit("google_places_daily_limit"),
    getGooglePlacesLimit("google_places_per_run_limit"),
    getDailyGoogleUsage(),
    getGooglePlacesApiKey().then((k) => Boolean(k?.trim()))
  ]);

  const availableToday = Math.max(0, dailyLimit - usedToday);

  return Response.json({
    google_configured: hasKey,
    daily_limit: dailyLimit,
    used_today: usedToday,
    available_today: availableToday,
    per_run_limit: perRunLimit
  });
}
