import { getSystemSetting } from "@/lib/system-settings";
import { decryptSecret, encryptSecret } from "@/lib/token-crypto";

const KEY = "google_places_api_key";

export async function getGooglePlacesApiKey(): Promise<string | null> {
  const row = await getSystemSetting(KEY);
  const raw = row?.value?.trim();
  if (!raw) return null;
  try {
    return decryptSecret(raw);
  } catch {
    return raw;
  }
}

export function encryptGooglePlacesApiKeyForStorage(plain: string): string {
  return encryptSecret(plain.trim());
}

export async function getGooglePlacesLimit(settingKey: "google_places_daily_limit" | "google_places_per_run_limit") {
  const row = await getSystemSetting(settingKey);
  const n = Number(row?.value ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : settingKey.includes("daily") ? 200 : 50;
}

export async function isLeadGenSimulationDefault(): Promise<boolean> {
  const row = await getSystemSetting("lead_generation_simulation_default");
  return row?.value === "1" || row?.value === "true";
}
