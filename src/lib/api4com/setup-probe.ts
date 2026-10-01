import { getUserExtension } from "@/lib/api4com/calls";
import { getApi4comConfig } from "@/lib/api4com/config";
import { getApi4comTokenPolicy } from "@/lib/api4com/token-policy";
import { normalizeApi4comApiToken } from "@/lib/api4com/token-normalize";
import { resolveApi4comApiTokenForUser } from "@/lib/api4com/user-token";

export type Api4comSetupProbe = {
  ok: boolean;
  token_policy: "global" | "per_bdr";
  extension: string | null;
  token_present: boolean;
  token_valid: boolean;
  extension_registered: boolean;
  account_email: string | null;
  extensions_on_account: string[];
  message: string;
  detail?: string;
};

async function api4comGet(path: string, token: string) {
  const cfg = await getApi4comConfig();
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers: { Authorization: token, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000)
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body, text };
}

function extractExtensionNumbers(payload: unknown): string[] {
  const list: unknown[] = [];
  if (Array.isArray(payload)) list.push(...payload);
  else if (payload && typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    if (Array.isArray(o.data)) list.push(...o.data);
    else if (Array.isArray(o.items)) list.push(...o.items);
  }
  const out: string[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const ramal = r.ramal ?? r.extension ?? r.number;
    if (ramal != null && String(ramal).trim()) out.push(String(ramal).trim());
  }
  return [...new Set(out)];
}

function accountEmailFromMe(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  const email = o.email ?? o.email_address;
  return email != null ? String(email) : null;
}

/** Valida token + ramal contra a API4COM (mesma checagem útil antes de ligar). */
export async function probeApi4comDialSetup(userId: number): Promise<Api4comSetupProbe> {
  const token_policy = await getApi4comTokenPolicy();
  const extension = await getUserExtension(userId);
  const tokenRaw = await resolveApi4comApiTokenForUser(userId);
  const token = tokenRaw ? normalizeApi4comApiToken(tokenRaw) : null;

  if (!token) {
    return {
      ok: false,
      token_policy,
      extension,
      token_present: false,
      token_valid: false,
      extension_registered: false,
      account_email: null,
      extensions_on_account: [],
      message:
        token_policy === "per_bdr"
          ? "Token não configurado. Cole um token novo em Meu perfil → Configurar token e salve."
          : "Token global ausente. Admin → API4COM → Token API (integração)."
    };
  }

  const me = await api4comGet("/api/v1/users/me", token);
  if (!me.ok) {
    const snippet = me.text.slice(0, 160).replace(/\s+/g, " ");
    return {
      ok: false,
      token_policy,
      extension,
      token_present: true,
      token_valid: false,
      extension_registered: false,
      account_email: null,
      extensions_on_account: [],
      message: "Token recusado pela API4COM (expirado, revogado ou incompleto). Gere um token novo e salve no perfil.",
      detail: snippet || `HTTP ${me.status}`
    };
  }

  const account_email = accountEmailFromMe(me.body);
  const extRes = await api4comGet("/api/v1/extensions", token);
  const extensions_on_account = extRes.ok ? extractExtensionNumbers(extRes.body) : [];
  const extension_registered = extension ? extensions_on_account.includes(extension) : false;

  if (!extension) {
    return {
      ok: false,
      token_policy,
      extension: null,
      token_present: true,
      token_valid: true,
      extension_registered: false,
      account_email,
      extensions_on_account,
      message: "Token OK, mas o ramal não está cadastrado no CRM. Use Meu perfil → Configurar ramal."
    };
  }

  if (!extension_registered) {
    const sample = extensions_on_account.slice(0, 8).join(", ");
    return {
      ok: false,
      token_policy,
      extension,
      token_present: true,
      token_valid: true,
      extension_registered: false,
      account_email,
      extensions_on_account,
      message:
        `Token OK, porém o ramal ${extension} não aparece na API de ramais desta conta. ` +
        "Confira app.api4com.com → Usuários e, se necessário, suporte API4COM para provisionar o ramal na telefonia.",
      detail: extensions_on_account.length > 0 ? `Ramais visíveis na API: ${sample}${extensions_on_account.length > 8 ? "…" : ""}` : "Nenhum ramal retornado em GET /extensions."
    };
  }

  return {
    ok: true,
    token_policy,
    extension,
    token_present: true,
    token_valid: true,
    extension_registered: true,
    account_email,
    extensions_on_account,
    message: `Pronto para ligar: token válido${account_email ? ` (${account_email})` : ""}, ramal ${extension} reconhecido pela API4COM.`
  };
}
