import { processLeadGenerationTick } from "@/lib/lead-generation/run-processor";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const urlSecret = new URL(request.url).searchParams.get("secret");
  if (process.env.NODE_ENV === "production") {
    if (!secret || (auth !== `Bearer ${secret}` && urlSecret !== secret)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await processLeadGenerationTick();
  return Response.json({ ok: true, ...result });
}
