import type { WarmScreenExecutionRow } from "@/lib/warm-screen/executions";

export function warmScreenProgressPct(ex: Pick<WarmScreenExecutionRow, "items_done" | "items_total">): number {
  if (!ex.items_total) return 0;
  return Math.min(100, Math.round((ex.items_done / ex.items_total) * 100));
}

export function warmScreenProgressDetail(ex: Pick<WarmScreenExecutionRow, "items_done" | "items_total" | "items_warmed">): string {
  return `${ex.items_done}/${ex.items_total} · ${ex.items_warmed} aquecidos`;
}

export function formatWarmScreenResultSummary(
  ex: Pick<WarmScreenExecutionRow, "items_warmed" | "items_skipped" | "items_error" | "items_done">
): string {
  const parts: string[] = [`${ex.items_warmed} aquecido${ex.items_warmed === 1 ? "" : "s"}`];
  if (ex.items_skipped > 0) {
    parts.push(`${ex.items_skipped} pulado${ex.items_skipped === 1 ? "" : "s"}`);
  }
  if (ex.items_error > 0) {
    parts.push(`${ex.items_error} erro${ex.items_error === 1 ? "" : "s"}`);
  }
  if (ex.items_done === 0 && ex.items_warmed === 0 && ex.items_skipped === 0 && ex.items_error === 0) {
    return "Nenhum lead processado ainda";
  }
  return parts.join(" · ");
}

export function showWarmScreenResultColumn(
  ex: Pick<WarmScreenExecutionRow, "status" | "items_done" | "items_total">
): boolean {
  if (ex.items_total <= 0) return false;
  if (["running", "paused"].includes(ex.status)) return true;
  if (ex.items_done > 0) return true;
  return ["completed", "stopped", "failed"].includes(ex.status);
}

export const WARM_SCREEN_ITEM_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  dialing: "Discando",
  completed_warmed: "Aquecido",
  completed_error: "Sem aquecimento",
  skipped: "Pulado",
  failed: "Falha"
};
