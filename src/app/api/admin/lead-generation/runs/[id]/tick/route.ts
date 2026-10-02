import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { drainLeadGenerationTicks } from "@/lib/lead-generation/drain-ticks";
import { formatLeadGenActivityEntry, runPhaseActivityLine } from "@/lib/lead-generation/activity-feed";
import {
  getLeadGenerationRun,
  listRunActivityFeed,
  recomputeRunCountsFromItems
} from "@/lib/lead-generation/runs-repo";

export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/** Avança a execução; use ?feed=1 para linhas recentes do log ao vivo. */
export async function POST(request: Request, { params }: Params) {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;

  const id = Number((await params).id);
  if (!Number.isFinite(id)) return Response.json({ error: "ID inválido" }, { status: 400 });

  const before = await getLeadGenerationRun(id);
  if (!before) return Response.json({ error: "Execução não encontrada" }, { status: 404 });

  const mayDrain =
    ["queued", "running"].includes(before.status) ||
    (before.status === "paused" && before.phase === "finalizing");

  if (mayDrain) {
    await drainLeadGenerationTicks({
      runId: id,
      maxTicks: before.phase === "finalizing" ? 2 : 6,
      maxMs: before.phase === "finalizing" ? 15_000 : 50_000
    });
  } else if (before.status === "paused") {
    return Response.json({ run: before });
  }

  let run = await getLeadGenerationRun(id);
  if (run && ["completed", "partial", "failed", "cancelled"].includes(run.status)) {
    run = { ...run, counts_json: await recomputeRunCountsFromItems(id) };
  }

  const wantFeed = new URL(request.url).searchParams.get("feed") === "1";
  if (!wantFeed || !run) {
    return Response.json({ run });
  }

  const feedRows = await listRunActivityFeed(id, 35);
  const activity = feedRows.map(formatLeadGenActivityEntry);
  const phase_line = runPhaseActivityLine({
    phase: run.phase,
    uf: run.uf,
    counts_json: run.counts_json
  });

  return Response.json({ run, activity, phase_line });
}
