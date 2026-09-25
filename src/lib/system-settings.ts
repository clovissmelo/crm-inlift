import { all, get, nowIso, run } from "@/lib/db";

export type SystemSettingRow = {
  key: string;
  label: string;
  category: string;
  value: string | null;
  is_secret: boolean;
  updated_at: string;
};

const ADMIN_SETTING_CATEGORIES = ["google_calendar", "google_places", "lead_discovery"] as const;

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
    await run(
      `
        UPDATE system_settings SET value = @value, updated_at = @now, updated_by_user_id = @userId
        WHERE key = @key
      `,
      { key: row.key, value: row.value, now: nowIso(), userId }
    );
  }
}
