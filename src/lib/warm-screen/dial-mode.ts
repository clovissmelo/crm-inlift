import { get } from "@/lib/db";

export type WarmScreenDialMode = "silent" | "assisted";

export function parseWarmScreenDialMode(raw: unknown): WarmScreenDialMode {
  return raw === "assisted" ? "assisted" : "silent";
}

export async function getWarmScreenDialModeForExecution(executionId: number): Promise<WarmScreenDialMode> {
  const row = await get<{ dial_mode: string | null }>(
    "SELECT dial_mode FROM warm_screen_executions WHERE id = @id",
    { id: executionId }
  );
  return parseWarmScreenDialMode(row?.dial_mode);
}

export async function getWarmScreenDialModeForCall(callId: number): Promise<WarmScreenDialMode | null> {
  const row = await get<{ metadata_json: string | null }>(
    "SELECT metadata_json FROM api4com_calls WHERE id = @id",
    { id: callId }
  );
  if (!row?.metadata_json) return null;
  let execId: number | null = null;
  try {
    const j = JSON.parse(row.metadata_json) as Record<string, unknown>;
    const raw = j.warm_screen_execution_id ?? (j.metadata as Record<string, unknown> | undefined)?.warm_screen_execution_id;
    if (raw != null) execId = Number(raw);
  } catch {
    return null;
  }
  if (!execId || !Number.isFinite(execId)) return null;
  return getWarmScreenDialModeForExecution(execId);
}
