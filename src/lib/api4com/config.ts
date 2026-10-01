import { normalizeApi4comApiToken } from "@/lib/api4com/token-normalize";
import { getSystemSetting } from "@/lib/system-settings";
import { decryptSecret } from "@/lib/token-crypto";

function readSecret(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  try {
    return decryptSecret(t);
  } catch {
    return t;
  }
}

export type Api4comConfig = {
  apiToken: string | null;
  gateway: string;
  webhookSecret: string | null;
  baseUrl: string;
};

export function getPublicAppBaseUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return null;
}

export function getApi4comWebhookUrl(): string | null {
  const base = getPublicAppBaseUrl();
  if (!base) return null;
  return `${base}/api/webhooks/api4com`;
}

/** Credenciais só no servidor: env tem prioridade sobre system_settings. */
export async function getApi4comConfig(): Promise<Api4comConfig> {
  const [tokenRow, gatewayRow, secretRow, baseRow] = await Promise.all([
    getSystemSetting("api4com_api_token"),
    getSystemSetting("api4com_gateway"),
    getSystemSetting("api4com_webhook_secret"),
    getSystemSetting("api4com_base_url")
  ]);

  const envToken = process.env.API4COM_API_TOKEN?.trim();
  const envGateway = process.env.API4COM_GATEWAY?.trim();
  const envSecret = process.env.API4COM_WEBHOOK_SECRET?.trim();
  const envBase = process.env.API4COM_BASE_URL?.trim();

  const rawToken = envToken || readSecret(tokenRow?.value) || null;
  return {
    apiToken: rawToken ? normalizeApi4comApiToken(rawToken) : null,
    gateway: envGateway || gatewayRow?.value?.trim() || "inlift-crm",
    webhookSecret: envSecret || readSecret(secretRow?.value) || null,
    baseUrl: (envBase || baseRow?.value?.trim() || "https://api.api4com.com").replace(/\/$/, "")
  };
}

/** Token global/env disponível (webhook, modo admin). */
export async function isApi4comIntegrationTokenConfigured() {
  const cfg = await getApi4comConfig();
  return Boolean(cfg.apiToken);
}

/** @deprecated use isApi4comIntegrationTokenConfigured */
export async function isApi4comConfigured() {
  return isApi4comIntegrationTokenConfigured();
}
