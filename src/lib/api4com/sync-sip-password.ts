import { getUserExtension } from "@/lib/api4com/calls";
import { fetchApi4comExtensionsWithToken } from "@/lib/api4com/fetch-extensions-detail";
import { normalizeApi4comExtension } from "@/lib/api4com/phone";
import { applyUserApi4comSipPassword, getUserApi4comSipPasswordDecrypted } from "@/lib/api4com/user-sip-password";
import { resolveApi4comApiTokenForUser } from "@/lib/api4com/user-token";
import { getApi4comTokenPolicy } from "@/lib/api4com/token-policy";
import { get } from "@/lib/db";
import type { UserRole } from "@/lib/types";

export type SyncSipPasswordResult = {
  ok: boolean;
  saved: boolean;
  already_configured: boolean;
  message: string;
};

/** Busca senha SIP do ramal na API4COM e grava no usuário (se a API expuser). */
export async function syncUserSipPasswordFromApi4com(
  userId: number,
  roles: UserRole[]
): Promise<SyncSipPasswordResult> {
  if (!roles.includes("bdr")) {
    return { ok: false, saved: false, already_configured: false, message: "Perfil sem telefonia BDR." };
  }

  const existing = await getUserApi4comSipPasswordDecrypted(userId);
  if (existing?.trim()) {
    return {
      ok: true,
      saved: false,
      already_configured: true,
      message: "Senha SIP já cadastrada."
    };
  }

  const extension = normalizeApi4comExtension((await getUserExtension(userId)) ?? "");
  if (!extension) {
    return { ok: false, saved: false, already_configured: false, message: "Cadastre o ramal antes." };
  }

  const token = await resolveApi4comApiTokenForUser(userId);
  if (!token) {
    const policy = await getApi4comTokenPolicy();
    return {
      ok: false,
      saved: false,
      already_configured: false,
      message:
        policy === "per_bdr"
          ? "Token ausente. Cadastre em Configurar token e salve."
          : "Token global ausente. Peça ao admin em API4COM → Credenciais."
    };
  }

  const api = await fetchApi4comExtensionsWithToken(token);
  if (!api.ok) {
    return {
      ok: false,
      saved: false,
      already_configured: false,
      message: api.error ?? "Não foi possível consultar ramais na API4COM."
    };
  }

  const row = api.extensions.find(
    (e) => normalizeApi4comExtension(e.ramal ?? "") === extension
  );
  if (!row) {
    return {
      ok: false,
      saved: false,
      already_configured: false,
      message: `Ramal ${extension} não encontrado na conta API4COM deste token.`
    };
  }

  const senha = row.senha?.trim();
  if (!senha) {
    return {
      ok: true,
      saved: false,
      already_configured: false,
      message:
        "A API4COM não retornou a senha SIP deste ramal. Copie manualmente no portal (Usuários → Webphone) ou peça ao admin."
    };
  }

  await applyUserApi4comSipPassword(userId, roles, senha);

  return {
    ok: true,
    saved: true,
    already_configured: false,
    message: "Senha SIP sincronizada automaticamente com a API4COM."
  };
}
