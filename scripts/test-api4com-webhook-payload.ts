/**
 * Exercita processApi4comWebhook com payloads de exemplo (idempotência e hangup).
 * Uso: npx tsx scripts/test-api4com-webhook-payload.ts
 * Requer DATABASE_URL/POSTGRES_URL e migration 010 aplicada.
 */
import { processApi4comWebhook, type Api4comWebhookPayload } from "../src/lib/api4com/calls";

const sampleHangup: Api4comWebhookPayload = {
  version: "1.8",
  eventType: "channel-hangup",
  id: "test-call-id-demo",
  direction: "outbound",
  caller: "1001",
  called: "5511999999999",
  startedAt: new Date(Date.now() - 60_000).toISOString(),
  answeredAt: new Date(Date.now() - 45_000).toISOString(),
  endedAt: new Date().toISOString(),
  hangupCauseCode: "16",
  hangupCause: "Normal clearing",
  metadata: {
    gateway: "inlift-crm",
    crm: "inlift",
    user_id: "1",
    call_record_id: "999999"
  }
};

async function main() {
  const eventId = "test-event-1";
  const first = await processApi4comWebhook(sampleHangup, eventId);
  const second = await processApi4comWebhook(sampleHangup, eventId);
  console.log("first", first);
  console.log("duplicate", second);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
