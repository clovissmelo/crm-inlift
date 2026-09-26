import { getSystemSetting } from "@/lib/system-settings";

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

  return {
    apiToken: envToken || tokenRow?.value?.trim() || null,
    gateway: envGateway || gatewayRow?.value?.trim() || "inlift-crm",
    webhookSecret: envSecret || secretRow?.value?.trim() || null,
    baseUrl: (envBase || baseRow?.value?.trim() || "https://api.api4com.com").replace(/\/$/, "")
  };
}

export async function isApi4comConfigured() {
  const cfg = await getApi4comConfig();
  return Boolean(cfg.apiToken);
}
