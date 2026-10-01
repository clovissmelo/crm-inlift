import { all, get, nowIso, run } from "@/lib/db";
import { encryptGoogleOAuthSecretForStorage } from "@/lib/google-oauth-settings";
import { encryptGooglePlacesApiKeyForStorage } from "@/lib/google-places-settings";
import { encryptSecret } from "@/lib/token-crypto";

export type SystemSettingRow = {
  key: string;
  label: string;
  category: string;
  value: string | null;
  is_secret: boolean;
  updated_at: string;
};

const ADMIN_SETTING_CATEGORIES = ["google_calendar", "google_places", "lead_discovery", "api4com"] as const;

export async function listSystemSettingsForAdmin() {
  const cats = ADMIN_SETTING_CATEGORIES.map((c) => `'${c}'`).join(", ");
  return all<SystemSettingRow>(
    `
      SELECT key, label, category, value, is_secret, updated_at::text AS updated_at
      FROM system_settings
      WHERE category IN (${cats})
      ORDER BY category, label
    `
  );
}

export async function getSystemSetting(key: string) {
  return get<{ value: string | null }>("SELECT value FROM system_settings WHERE key = @key", { key });
}

export async function updateSystemSettings(
  updates: Array<{ key: string; value: string | null }>,
  userId: number
) {
  for (const row of updates) {
    let value = row.value;
    if (row.key === "google_places_api_key" && value && value.trim()) {
      value = encryptGooglePlacesApiKeyForStorage(value);
    }
    if (row.key === "google_oauth_client_secret" && value && value.trim()) {
      value = encryptGoogleOAuthSecretForStorage(value);
    }
    if ((row.key === "api4com_api_token" || row.key === "api4com_webhook_secret") && value && value.trim()) {
      value = encryptSecret(value.trim());
    }
    await run(
      `
        UPDATE system_settings SET value = @value, updated_at = @now, updated_by_user_id = @userId
        WHERE key = @key
      `,
      { key: row.key, value, now: nowIso(), userId }
    );
  }
}
