import { get, run } from "@/lib/db";
import { getApi4comConfig } from "@/lib/api4com/config";
import { normalizeApi4comApiToken } from "@/lib/api4com/token-normalize";
import { getApi4comTokenPolicy } from "@/lib/api4com/token-policy";
import type { UserRole } from "@/lib/types";

export async function applyUserApi4comApiToken(
  userId: number,
  roles: UserRole[],
  token: string | null | undefined,
  options?: { clear?: boolean }
) {
  if (!roles.includes("bdr")) {
    await run("UPDATE users SET api4com_api_token = NULL WHERE id = @id", { id: userId });
    return;
  }
  const policy = await getApi4comTokenPolicy();
  if (policy === "global") {
    if (options?.clear) {
      await run("UPDATE users SET api4com_api_token = NULL WHERE id = @id", { id: userId });
    }
    return;
  }
  if (token === undefined && !options?.clear) return;
  const value =
    options?.clear || token === null || token === "" || token === undefined
      ? null
      : normalizeApi4comApiToken(token);
  await run("UPDATE users SET api4com_api_token = @token WHERE id = @id", { token: value, id: userId });
}

/** Token da BDR; no modo global usa só o token do Admin (ignora token antigo no usuário). */
export async function resolveApi4comApiTokenForUser(userId: number): Promise<string | null> {
  const policy = await getApi4comTokenPolicy();
  if (policy === "global") {
    const cfg = await getApi4comConfig();
    return cfg.apiToken?.trim() || null;
  }
  const row = await get<{ api4com_api_token: string | null }>(
    "SELECT api4com_api_token FROM users WHERE id = @id",
    { id: userId }
  );
  const raw = row?.api4com_api_token?.trim();
  return raw ? normalizeApi4comApiToken(raw) : null;
}
