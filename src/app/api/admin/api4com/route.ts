import { requireAdminApi } from "@/lib/admin";
import { api4comRegisterWebhookIntegration } from "@/lib/api4com/client";
import { getApi4comConfig, getApi4comWebhookUrl, isApi4comConfigured } from "@/lib/api4com/config";
import { requireApiUser } from "@/lib/auth";

export async function GET() {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;

  const configured = await isApi4comConfigured();
  const webhookUrl = getApi4comWebhookUrl();
  const cfg = await getApi4comConfig();

  return Response.json({
    configured,
    webhook_url: webhookUrl,
    gateway: cfg.gateway,
    base_url: cfg.baseUrl,
    has_webhook_secret: Boolean(cfg.webhookSecret),
    docs: {
      calls: "POST /api/v1/calls",
      integrations: "PATCH /api/v1/integrations",
      webhook_events: ["channel-hangup", "channel-answer"]
    }
  });
}

export async function POST() {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;

  const webhookUrl = getApi4comWebhookUrl();
  if (!webhookUrl) {
    return Response.json(
      { error: "Defina NEXT_PUBLIC_APP_URL (ou deploy na Vercel) para montar a URL do webhook." },
      { status: 400 }
    );
  }

  try {
    await api4comRegisterWebhookIntegration(webhookUrl);
    return Response.json({ ok: true, webhook_url: webhookUrl });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Falha ao sincronizar" }, { status: 400 });
  }
}
