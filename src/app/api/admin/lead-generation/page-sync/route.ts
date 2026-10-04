import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { formatLeadGenActivityEntry, runPhaseActivityLine } from "@/lib/lead-generation/activity-feed";
import { drainLeadGenerationTicks } from "@/lib/lead-generation/drain-ticks";
import { buildLeadGenQuotaPanel } from "@/lib/lead-generation/quota-panel";
import { computeRunProgressPct } from "@/lib/lead-generation/run-progress";
import {
  getLeadGenerationRun,
  listLeadGenerationRunsForDisplay,
  listRunActivityFeed,
  recomputeRunCountsFromItems
} from "@/lib/lead-generation/runs-repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const ACTIVE = new Set(["queued", "running", "paused"]);

function jsonNoStore(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache"
    }
  });
}

export async function GET(request: Request) {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;

  const url = new URL(request.url);
  const watchRaw = url.searchParams.get("watch");
  const wantFeed = url.searchParams.get("feed") === "1";
  const wantMotor = url.searchParams.get("motor") === "1";

  const [runs, quota] = await Promise.all([listLeadGenerationRunsForDisplay(40), buildLeadGenQuotaPanel()]);

  let watch: {
    run: Awaited<ReturnType<typeof getLeadGenerationRun>>;
    activity?: ReturnType<typeof formatLeadGenActivityEntry>[];
    phase_line?: string | null;
  } | null = null;

  if (watchRaw) {
    const watchId = Number(watchRaw);
    if (Number.isFinite(watchId) && watchId > 0) {
      let run = await getLeadGenerationRun(watchId);
      if (run) {
        if (wantMotor && ACTIVE.has(run.status)) {
          await drainLeadGenerationTicks({ runId: watchId, maxTicks: 1, maxMs: 22_000 });
          run = await getLeadGenerationRun(watchId);
          if (!run) {
            watch = null;
          }
        }
      }
      if (run) {
        const counts_json = await recomputeRunCountsFromItems(watchId);
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
        if (wantFeed) {
          const feedRows = await listRunActivityFeed(watchId, 35);
          watch = {
            run,
            activity: feedRows.map(formatLeadGenActivityEntry),
            phase_line: runPhaseActivityLine({
              phase: run.phase,
              uf: run.uf,
              counts_json: run.counts_json
            })
          };
        } else {
          watch = { run };
        }
      }
    }
  }

  return jsonNoStore({
    server_time: new Date().toISOString(),
    runs,
    quota,
    watch
  });
}
