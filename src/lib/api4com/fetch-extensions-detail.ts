import { getApi4comConfig } from "@/lib/api4com/config";
import { getApi4comSipDomain } from "@/lib/api4com/sip-domain";
import { getApi4comTokenPolicy } from "@/lib/api4com/token-policy";
import { resolveApi4comTokenForAdminApiOperations } from "@/lib/api4com/user-token";

export type Api4comExtensionDetail = {
  id: number | null;
  ramal: string | null;
  senha: string | null;
  email: string | null;
  domain: string | null;
  first_name: string | null;
  last_name: string | null;
};

function parseExtensionList(payload: unknown): Api4comExtensionDetail[] {
  const list: unknown[] = [];
  if (Array.isArray(payload)) list.push(...payload);
  else if (payload && typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    if (Array.isArray(o.data)) list.push(...o.data);
    else if (Array.isArray(o.items)) list.push(...o.items);
  }

  const out: Api4comExtensionDetail[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const ramalRaw = r.ramal ?? r.extension;
    out.push({
      id: r.id != null ? Number(r.id) : null,
      ramal: ramalRaw != null ? String(ramalRaw).trim() : null,
      senha: r.senha != null ? String(r.senha) : r.password != null ? String(r.password) : null,
      email:
        r.email_address != null
          ? String(r.email_address).trim()
          : r.email != null
            ? String(r.email).trim()
            : null,
      domain: r.domain != null ? String(r.domain).trim() : null,
      first_name: r.first_name != null ? String(r.first_name) : null,
      last_name: r.last_name != null ? String(r.last_name) : null
    });
  }
  return out;
}

const TOKEN_MISSING_MSG =
  "Token API4COM não configurado. No modo «Cada BDR no perfil»: cadastre o token master em Webhook e telefonia, ou o token de alguma BDR em Meu perfil, e tente de novo.";

export type Api4comExtensionsFetchResult = {
  ok: boolean;
  http_status: number;
  sip_domain: string | null;
  extensions: Api4comExtensionDetail[];
  error?: string;
};

/** Lista ramais na conta (inclui senha SIP se a API4COM devolver). */
export async function fetchApi4comExtensionsWithToken(apiToken: string): Promise<Api4comExtensionsFetchResult> {
  const cfg = await getApi4comConfig();
  const sip_domain = await getApi4comSipDomain();

  const res = await fetch(`${cfg.baseUrl}/api/v1/extensions`, {
    headers: { Authorization: apiToken, Accept: "application/json" },
    signal: AbortSignal.timeout(25_000)
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return {
      ok: false,
      http_status: res.status,
      sip_domain,
      extensions: [],
      error: `Resposta inválida da API4COM (${res.status}).`
    };
  }

  if (!res.ok) {
    const msg =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : text.slice(0, 200);
    return { ok: false, http_status: res.status, sip_domain, extensions: [], error: msg };
  }

  const extensions = parseExtensionList(body).map((e) => ({
    ...e,
    domain: e.domain ?? sip_domain
  }));

  return { ok: true, http_status: res.status, sip_domain, extensions };
}

/** Lista ramais na conta (inclui senha SIP se a API4COM devolver). */
export async function fetchApi4comExtensionDetails(adminUserId: number): Promise<Api4comExtensionsFetchResult> {
  const sip_domain = await getApi4comSipDomain();
  const token = await resolveApi4comTokenForAdminApiOperations(adminUserId);
  if (!token) {
    const policy = await getApi4comTokenPolicy();
    return {
      ok: false,
      http_status: 0,
      sip_domain,
      extensions: [],
      error:
        policy === "per_bdr"
          ? TOKEN_MISSING_MSG
          : "Token API4COM não configurado. Cadastre o token global em Credenciais e salve."
    };
  }

  return fetchApi4comExtensionsWithToken(token);
}
