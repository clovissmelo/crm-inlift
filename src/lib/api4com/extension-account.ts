import { getApi4comConfig } from "@/lib/api4com/config";

export type Api4comExtensionRow = {
  ramal: string;
  email: string | null;
};

function normalizeEmail(email: string | null | undefined): string | null {
  const e = email?.trim();
  return e ? e.toLowerCase() : null;
}

export function parseApi4comExtensionRows(payload: unknown): Api4comExtensionRow[] {
  const list: unknown[] = [];
  if (Array.isArray(payload)) list.push(...payload);
  else if (payload && typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    if (Array.isArray(o.data)) list.push(...o.data);
    else if (Array.isArray(o.items)) list.push(...o.items);
  }

  const out: Api4comExtensionRow[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const ramalRaw = r.ramal ?? r.extension;
    if (ramalRaw == null || !String(ramalRaw).trim()) continue;
    const emailRaw = r.email_address ?? r.email;
    out.push({
      ramal: String(ramalRaw).trim(),
      email: emailRaw != null ? String(emailRaw).trim() : null
    });
  }
  return out;
}

export function extensionNumbersFromRows(rows: Api4comExtensionRow[]): string[] {
  return [...new Set(rows.map((r) => r.ramal))];
}

export function accountEmailFromMePayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  const email = o.email ?? o.email_address;
  return email != null ? String(email).trim() : null;
}

/** Ramal existe na conta e (quando possível) pertence ao e-mail do token. */
export function assessApi4comExtensionForToken(input: {
  crmExtension: string;
  tokenAccountEmail: string | null;
  rows: Api4comExtensionRow[];
}): {
  on_account: boolean;
  linked_to_token_user: boolean;
  extension_owner_email: string | null;
} {
  const row = input.rows.find((r) => r.ramal === input.crmExtension);
  if (!row) {
    return { on_account: false, linked_to_token_user: false, extension_owner_email: null };
  }

  const tokenEmail = normalizeEmail(input.tokenAccountEmail);
  const ownerEmail = normalizeEmail(row.email);
  if (!tokenEmail || !ownerEmail) {
    return { on_account: true, linked_to_token_user: true, extension_owner_email: row.email };
  }

  return {
    on_account: true,
    linked_to_token_user: tokenEmail === ownerEmail,
    extension_owner_email: row.email
  };
}

export async function fetchApi4comExtensionRows(apiToken: string): Promise<Api4comExtensionRow[]> {
  const cfg = await getApi4comConfig();
  const res = await fetch(`${cfg.baseUrl}/api/v1/extensions`, {
    headers: { Authorization: apiToken, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000)
  });
  if (!res.ok) return [];
  const body = (await res.json().catch(() => null)) as unknown;
  return parseApi4comExtensionRows(body);
}

export function buildExtensionTokenMismatchMessage(input: {
  extension: string;
  tokenAccountEmail: string | null;
  extensionOwnerEmail: string | null;
}): string {
  const tokenPart = input.tokenAccountEmail ? ` (${input.tokenAccountEmail})` : "";
  const ownerPart = input.extensionOwnerEmail ? ` (${input.extensionOwnerEmail})` : "";
  return (
    `O ramal ${input.extension} existe na conta API4COM, mas está vinculado a outro usuário${ownerPart}. ` +
    `Seu token de acesso pertence${tokenPart || " a outra conta"}. ` +
    "No painel app.api4com.com → Usuários, confira o ramal do mesmo e-mail do token e atualize em Meu perfil → Configurar ramal. " +
    "Se precisar usar este ramal, gere o token em Tokens de acesso logado na conta correta."
  );
}

/** Mesma regra do teste de perfil — evita discar com ramal de outro usuário na conta. */
export async function assertApi4comExtensionLinkedToToken(apiToken: string, crmExtension: string): Promise<void> {
  const cfg = await getApi4comConfig();
  const meRes = await fetch(`${cfg.baseUrl}/api/v1/users/me`, {
    headers: { Authorization: apiToken, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000)
  });
  if (!meRes.ok) return;

  const meBody = (await meRes.json().catch(() => null)) as unknown;
  const tokenAccountEmail = accountEmailFromMePayload(meBody);
  const rows = await fetchApi4comExtensionRows(apiToken);
  const assessment = assessApi4comExtensionForToken({
    crmExtension,
    tokenAccountEmail,
    rows
  });

  if (!assessment.on_account) {
    throw new Error(
      `O ramal ${crmExtension} não aparece na API4COM com este token. Confira app.api4com.com → Usuários e atualize em Meu perfil.`
    );
  }
  if (!assessment.linked_to_token_user) {
    throw new Error(
      buildExtensionTokenMismatchMessage({
        extension: crmExtension,
        tokenAccountEmail,
        extensionOwnerEmail: assessment.extension_owner_email
      })
    );
  }
}
