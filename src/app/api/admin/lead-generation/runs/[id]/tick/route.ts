import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { drainLeadGenerationTicks } from "@/lib/lead-generation/drain-ticks";
import { bootstrapLeadGenRunAnpMetadata } from "@/lib/lead-generation/run-processor";
import { anpLoadComplete, computeRunProgressPct } from "@/lib/lead-generation/run-progress";
import { formatLeadGenActivityEntry, runPhaseActivityLine } from "@/lib/lead-generation/activity-feed";
import {
  finalizeCancelledRun,
  getLeadGenerationRun,
  listRunActivityFeed,
  recomputeRunCountsFromItems,
  touchRunActivity,
  updateRun
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

  const wantFeed = new URL(request.url).searchParams.get("feed") === "1";

  if (before.cancel_requested) {
    await finalizeCancelledRun(id);
    const run = await getLeadGenerationRun(id);
    if (!run) return Response.json({ error: "Execução não encontrada" }, { status: 404 });
    return Response.json(await leadGenTickResponse(id, run, wantFeed));
  }

  await touchRunActivity(id);

  if (
    ["queued", "running"].includes(before.status) &&
    (before.phase === "anp_load" || (before.phase === "processing" && !anpLoadComplete(before.counts_json)))
  ) {
    await bootstrapLeadGenRunAnpMetadata(id);
  }

  const mayDrain =
    ["queued", "running"].includes(before.status) ||
    (before.status === "paused" && before.phase === "finalizing");

  if (mayDrain) {
    const processing = before.phase === "processing";
    const smallMeta = before.max_stations <= 3;
    await drainLeadGenerationTicks({
      runId: id,
      maxTicks: before.phase === "finalizing" ? 2 : processing ? 6 : smallMeta ? 6 : 4,
      maxMs: before.phase === "finalizing" ? 12_000 : processing ? 48_000 : smallMeta ? 50_000 : 38_000
    });
  } else if (before.status === "paused") {
    return Response.json(await leadGenTickResponse(id, before, wantFeed));
  }

  let run = await getLeadGenerationRun(id);
  if (!run) return Response.json({ error: "Execução não encontrada" }, { status: 404 });

  const counts_json = await recomputeRunCountsFromItems(id);
  const progress_pct = computeRunProgressPct({
    phase: run.phase,
    status: run.status,
    max_stations: run.max_stations,
    counts_json
  });
  if (
    (run.counts_json.cities_total ?? 0) !== (counts_json.cities_total ?? 0) ||
    progress_pct !== run.progress_pct
  ) {
    await updateRun(id, { counts_json, progress_pct });
  }
  run = { ...run, counts_json, progress_pct };

  return Response.json(await leadGenTickResponse(id, run, wantFeed));
}

async function leadGenTickResponse(
  id: number,
  run: NonNullable<Awaited<ReturnType<typeof getLeadGenerationRun>>>,
  wantFeed: boolean
) {
  if (!wantFeed) return { run };

  const feedRows = await listRunActivityFeed(id, 35);
  const activity = feedRows.map(formatLeadGenActivityEntry);
  const phase_line = runPhaseActivityLine({
    phase: run.phase,
    uf: run.uf,
    counts_json: run.counts_json
  });

  return { run, activity, phase_line };
}
