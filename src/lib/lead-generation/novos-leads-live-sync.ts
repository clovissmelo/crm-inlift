export const NOVOS_LEADS_META_REFRESH_MS = 18_000;

function runNeedsLeadGenDrain(run: { status: string; phase: string } | null | undefined): boolean {
  if (!run) return true;
  if (run.status === "queued" || run.status === "running") return true;
  if (run.status === "paused" && run.phase === "finalizing") return true;
  return false;
}

export type NovosLeadsPollMode = "tick" | "refresh";

const RUN_POLL_STATUSES = new Set(["queued", "running", "paused"]);

type RunSnap = { status: string; phase: string } | null | undefined;

export function resolveNovosLeadsPollTarget(args: {
  starting: boolean;
  runIdToPoll: number | null;
  execOverlayOpen: boolean;
  backgroundRunNotice: boolean;
  shownRunId: number | null | undefined;
  getRun: (id: number) => RunSnap;
}): { id: number; mode: NovosLeadsPollMode } | null {
  if (args.starting) return null;

  if (args.runIdToPoll != null) {
    const snap = args.getRun(args.runIdToPoll);
    const mode = snap && runNeedsLeadGenDrain(snap) ? "tick" : "refresh";
    return { id: args.runIdToPoll, mode };
  }

  if ((args.execOverlayOpen || args.backgroundRunNotice) && args.shownRunId != null && args.shownRunId > 0) {
    const snap = args.getRun(args.shownRunId);
    if (snap && RUN_POLL_STATUSES.has(snap.status)) {
      return { id: args.shownRunId, mode: runNeedsLeadGenDrain(snap) ? "tick" : "refresh" };
    }
    return { id: args.shownRunId, mode: "refresh" };
  }

  return null;
}

export function novosLeadsPollIntervalMs(args: {
  mode: NovosLeadsPollMode;
  execOverlayOpen: boolean;
  backgroundRunNotice: boolean;
  runSnap: RunSnap;
}): number {
  if (args.mode === "refresh") {
    return args.execOverlayOpen ? 6000 : 10_000;
  }
  if (args.runSnap && !runNeedsLeadGenDrain(args.runSnap)) {
    return args.execOverlayOpen ? 8000 : 12_000;
  }
  return args.execOverlayOpen ? 2500 : args.backgroundRunNotice ? 4500 : 4000;
}
