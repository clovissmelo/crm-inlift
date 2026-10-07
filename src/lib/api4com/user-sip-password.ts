import { get, run } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/token-crypto";
import type { UserRole } from "@/lib/types";

function readStoredSecret(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  try {
    return decryptSecret(t);
  } catch {
    return t;
  }
}

export async function applyUserApi4comSipPassword(
  userId: number,
  roles: UserRole[],
  password: string | null | undefined,
  options?: { clear?: boolean }
) {
  if (!roles.includes("bdr")) {
    await run("UPDATE users SET api4com_sip_password = NULL WHERE id = @id", { id: userId });
    return;
  }
  if (password === undefined && !options?.clear) return;
  const plain =
    options?.clear || password === null || password === undefined || password.trim() === ""
      ? null
      : password.trim();
  const value = plain ? encryptSecret(plain) : null;
  await run("UPDATE users SET api4com_sip_password = @value WHERE id = @id", { value, id: userId });
}

export async function getUserApi4comSipPasswordDecrypted(userId: number): Promise<string | null> {
  const row = await get<{ api4com_sip_password: string | null }>(
    "SELECT api4com_sip_password FROM users WHERE id = @id",
    { id: userId }
  );
  return readStoredSecret(row?.api4com_sip_password);
}

export function userHasApi4comSipPasswordStored(raw: string | null | undefined): boolean {
  return Boolean(raw?.trim());
}
