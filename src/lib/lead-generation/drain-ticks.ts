import { getLeadGenerationRun } from "@/lib/lead-generation/runs-repo";
import { processLeadGenerationTick } from "@/lib/lead-generation/run-processor";

const ACTIVE = new Set(["queued", "running", "paused"]);

/** Avança execução em segundo plano (Hobby Vercel — sem cron por minuto). */
export async function drainLeadGenerationTicks(opts: {
  runId?: number;
  maxTicks?: number;
  maxMs?: number;
}) {
  const maxTicks = opts.maxTicks ?? 8;
  const deadline = Date.now() + (opts.maxMs ?? 50_000);

  for (let i = 0; i < maxTicks && Date.now() < deadline; i++) {
    if (opts.runId) {
      const run = await getLeadGenerationRun(opts.runId);
      if (!run || !ACTIVE.has(run.status)) break;
      if (run.status === "paused") break;
    }
    await processLeadGenerationTick();
  }
}
