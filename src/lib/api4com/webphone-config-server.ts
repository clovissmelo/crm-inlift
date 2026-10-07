import { normalizeApi4comExtension } from "@/lib/api4com/phone";
import { getApi4comSipDomain } from "@/lib/api4com/sip-domain";
import { getUserApi4comSipPasswordDecrypted } from "@/lib/api4com/user-sip-password";
import { get } from "@/lib/db";
import type { User } from "@/lib/types";

export type Api4comWebphoneConfigResult = {
  ok: boolean;
  missing: Array<"domain" | "extension" | "sip_password">;
  domain: string | null;
  extension: string | null;
  target_user_id: number;
  target_user_name: string | null;
  sip_password?: string;
};

export async function resolveApi4comWebphoneConfigForSession(
  sessionUser: User,
  targetUserId: number
): Promise<Api4comWebphoneConfigResult | { error: string; status: number }> {
  const isSelf = targetUserId === sessionUser.id;
  const isAdmin = sessionUser.roles.includes("admin");
  if (!isSelf && !isAdmin) {
    return { error: "Sem permissão para o ramal deste usuário.", status: 403 };
  }

  const canUseWebphone = sessionUser.roles.includes("bdr") || isAdmin;
  if (!canUseWebphone) {
    return { error: "Telefonia disponível apenas para BDR ou administrador.", status: 403 };
  }

  const row = await get<{ name: string; api4com_extension: string | null; status: string }>(
    "SELECT name, api4com_extension, status FROM users WHERE id = @id",
    { id: targetUserId }
  );
  if (!row || row.status !== "active") {
    return { error: "Usuário não encontrado ou inativo.", status: 404 };
  }

  const domain = await getApi4comSipDomain();
  const extension = normalizeApi4comExtension(row.api4com_extension ?? "");
  const sipPassword = await getUserApi4comSipPasswordDecrypted(targetUserId);

  const missing: Api4comWebphoneConfigResult["missing"] = [];
  if (!domain) missing.push("domain");
  if (!extension) missing.push("extension");
  if (!sipPassword) missing.push("sip_password");

  const base: Api4comWebphoneConfigResult = {
    ok: missing.length === 0,
    missing,
    domain,
    extension: extension || null,
    target_user_id: targetUserId,
    target_user_name: row.name
  };

  if (!base.ok) return base;

  return { ...base, sip_password: sipPassword! };
}
