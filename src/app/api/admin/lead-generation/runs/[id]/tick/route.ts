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

  if (before.status === "paused") {
    return Response.json({ run: before });
  }

  if (["queued", "running"].includes(before.status)) {
    await drainLeadGenerationTicks({ runId: id, maxTicks: 6, maxMs: 50_000 });
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
    counts_json: run.counts_json as Record<string, number>
  });

  return Response.json({ run, activity, phase_line });
}
