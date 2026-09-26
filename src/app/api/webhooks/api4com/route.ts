import crypto from "node:crypto";
import { getApi4comConfig } from "@/lib/api4com/config";
import { processApi4comWebhook, type Api4comWebhookPayload } from "@/lib/api4com/calls";

function webhookEventId(payload: Api4comWebhookPayload) {
  const base = payload.id ?? JSON.stringify(payload).slice(0, 120);
  return crypto.createHash("sha256").update(`${payload.eventType ?? ""}:${base}`).digest("hex");
}

export async function POST(request: Request) {
  const cfg = await getApi4comConfig();
  if (cfg.webhookSecret) {
    const header = request.headers.get("x-api4com-webhook-secret") ?? request.headers.get("x-webhook-secret");
    const query = new URL(request.url).searchParams.get("secret");
    const provided = header ?? query;
    if (!provided || provided !== cfg.webhookSecret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let payload: Api4comWebhookPayload;
  try {
    payload = (await request.json()) as Api4comWebhookPayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await processApi4comWebhook(payload, webhookEventId(payload));
  return Response.json(result);
}
