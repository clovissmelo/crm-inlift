import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { formatLeadGenActivityEntry, runPhaseActivityLine } from "@/lib/lead-generation/activity-feed";
import { drainLeadGenerationTicks } from "@/lib/lead-generation/drain-ticks";
import { computeRunProgressPct } from "@/lib/lead-generation/run-progress";
import {
  deleteLeadGenerationRun,
  getLeadGenerationRun,
  listRunActivityFeed,
  listRunItems,
  recomputeRunCountsFromItems
} from "@/lib/lead-generation/runs-repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;

  const id = Number((await params).id);
  if (!Number.isFinite(id)) return Response.json({ error: "ID inválido" }, { status: 400 });

  const url = new URL(_request.url);
  const refreshOnly = url.searchParams.get("refresh") === "1";

  let run = await getLeadGenerationRun(id);
  if (!run) return Response.json({ error: "Execução não encontrada" }, { status: 404 });

  if (!refreshOnly && ["queued", "running"].includes(run.status)) {
    await drainLeadGenerationTicks({ runId: id, maxTicks: 5, maxMs: 22_000 });
    run = (await getLeadGenerationRun(id))!;
  }

  if (["queued", "running", "paused", "completed", "partial", "failed", "cancelled"].includes(run.status)) {
    const counts_json = await recomputeRunCountsFromItems(id);
    run = {
      ...run,
      counts_json,
      progress_pct: computeRunProgressPct({
        phase: run.phase,
        status: run.status,
        max_stations: run.max_stations,
        counts_json
      })
    };
  }

  const tab = url.searchParams.get("tab");
  const wantFeed = url.searchParams.get("feed") === "1";
  let items: Record<string, unknown>[] | undefined;
  if (tab === "created") items = await listRunItems(id, "created");
  else if (tab === "existing") items = await listRunItems(id, "existing");
  else if (tab === "ambiguous") items = await listRunItems(id, "ambiguous");
  else if (tab === "errors") {
    const err = await listRunItems(id, "error");
    const ng = await listRunItems(id, "no_google_match");
    items = [...err, ...ng];
  }

  if (!wantFeed) {
    return Response.json({ run, items });
  }

  const feedRows = await listRunActivityFeed(id, 35);
  const activity = feedRows.map(formatLeadGenActivityEntry);
  const phase_line = runPhaseActivityLine({
    phase: run.phase,
    uf: run.uf,
    counts_json: run.counts_json
  });

  return Response.json({ run, items, activity, phase_line });
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  const denied = requireAdminApi(user);
  if (denied) return denied;

  const id = Number((await params).id);
  if (!Number.isFinite(id)) return Response.json({ error: "ID inválido" }, { status: 400 });

  try {
    await deleteLeadGenerationRun(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Não foi possível excluir.";
    const status = msg.includes("não encontrada") ? 404 : msg.includes("andamento") ? 409 : 400;
    return Response.json({ error: msg }, { status });
  }

  return Response.json({ ok: true });
}
