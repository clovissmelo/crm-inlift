import { get, run } from "@/lib/db";
import { getApi4comConfig } from "@/lib/api4com/config";
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
  if (token === undefined && !options?.clear) return;
  const value =
    options?.clear || token === null || token === "" || token === undefined ? null : token.trim();
  await run("UPDATE users SET api4com_api_token = @token WHERE id = @id", { token: value, id: userId });
}

/** Token da BDR; se vazio, usa o token global da integração. */
export async function resolveApi4comApiTokenForUser(userId: number): Promise<string | null> {
  const row = await get<{ api4com_api_token: string | null }>(
    "SELECT api4com_api_token FROM users WHERE id = @id",
    { id: userId }
  );
  const personal = row?.api4com_api_token?.trim();
  if (personal) return personal;
  const cfg = await getApi4comConfig();
  return cfg.apiToken;
}
