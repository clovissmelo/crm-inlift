import { all, get } from "@/lib/db";
import { normalizeApi4comExtension } from "@/lib/api4com/phone";
import type { Api4comDialIdentity } from "@/lib/api4com/dial-identity-shared";

export { API4COM_NO_EXTENSION_MESSAGE } from "@/lib/api4com/dial-identity-shared";
export type { Api4comDialIdentity } from "@/lib/api4com/dial-identity-shared";

async function userHasActiveExtension(userId: number): Promise<boolean> {
  const row = await get<{ api4com_extension: string | null; status: string }>(
    "SELECT api4com_extension, status FROM users WHERE id = @id",
    { id: userId }
  );
  if (!row || row.status !== "active") return false;
  return Boolean(normalizeApi4comExtension(row.api4com_extension ?? ""));
}

export async function listApi4comDialIdentities(): Promise<Api4comDialIdentity[]> {
  return all<Api4comDialIdentity>(
    `
      SELECT id, name, email, api4com_extension
      FROM users
      WHERE status = 'active'
        AND api4com_extension IS NOT NULL
        AND TRIM(api4com_extension) <> ''
      ORDER BY name ASC, id ASC
    `
  );
}

export async function assertDialIdentityAllowed(input: {
  sessionUserId: number;
  isAdmin: boolean;
  dialIdentityUserId: number;
}): Promise<void> {
  if (input.dialIdentityUserId === input.sessionUserId) return;
  if (!input.isAdmin) {
    throw new Error("Apenas administradores podem ligar em nome de outro usuário.");
  }
  if (!(await userHasActiveExtension(input.dialIdentityUserId))) {
    throw new Error("O usuário selecionado não possui ramal configurado.");
  }
}
