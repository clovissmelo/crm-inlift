import { getDailyGoogleUsage } from "@/lib/lead-generation/quota";
import { getGooglePlacesApiKey, getGooglePlacesLimit } from "@/lib/google-places-settings";

export type LeadGenQuotaPanel = {
  google_configured: boolean;
  daily_limit: number;
  used_today: number;
  available_today: number;
  per_run_limit: number;
};

export async function buildLeadGenQuotaPanel(): Promise<LeadGenQuotaPanel> {
  const [dailyLimit, perRunLimit, usedToday, hasKey] = await Promise.all([
    getGooglePlacesLimit("google_places_daily_limit"),
    getGooglePlacesLimit("google_places_per_run_limit"),
    getDailyGoogleUsage(),
    getGooglePlacesApiKey().then((k) => Boolean(k?.trim()))
  ]);
  const availableToday = Math.max(0, dailyLimit - usedToday);
  return {
    google_configured: hasKey,
    daily_limit: dailyLimit,
    used_today: usedToday,
    available_today: availableToday,
    per_run_limit: perRunLimit
  };
}
