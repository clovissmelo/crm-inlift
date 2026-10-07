import { get } from "@/lib/db";
import { WARM_SCREEN_PURPOSE } from "@/lib/warm-screen/constants";

function readPurposeFromParsed(meta: Record<string, unknown>): string | null {
  if (typeof meta.purpose === "string" && meta.purpose) return meta.purpose;
  const nested = meta.metadata;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const p = (nested as Record<string, unknown>).purpose;
    if (typeof p === "string" && p) return p;
  }
  return null;
}

export function metadataIndicatesWarmScreen(metadataJson: string | null | undefined): boolean {
  if (!metadataJson?.trim()) return false;
  try {
    const parsed = JSON.parse(metadataJson) as Record<string, unknown>;
    return readPurposeFromParsed(parsed) === WARM_SCREEN_PURPOSE;
  } catch {
    return false;
  }
}

export async function callIsWarmScreenCall(callId: number, metadataJson: string | null | undefined): Promise<boolean> {
  if (metadataIndicatesWarmScreen(metadataJson)) return true;
  const row = await get<{ n: number }>(
    `
      SELECT 1 AS n FROM warm_screen_execution_items
      WHERE api4com_call_row_id = @id
      LIMIT 1
    `,
    { id: callId }
  );
  return Boolean(row);
}

/** Preserva marcação do motor quando webhooks substituem metadata_json. */
export function mergeApi4comWebhookMetadata(
  previousJson: string | null | undefined,
  payload: Record<string, unknown>
): string {
  let prev: Record<string, unknown> = {};
  try {
    prev = JSON.parse(previousJson ?? "{}") as Record<string, unknown>;
  } catch {
    prev = {};
  }

  const prevNested =
    prev.metadata && typeof prev.metadata === "object" && !Array.isArray(prev.metadata)
      ? (prev.metadata as Record<string, unknown>)
      : {};
  const payNested =
    payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)
      ? (payload.metadata as Record<string, unknown>)
      : {};

  const purpose = readPurposeFromParsed(prev) ?? readPurposeFromParsed(payload as Record<string, unknown>);
  const warmExecutionId =
    prev.warm_screen_execution_id ??
    prevNested.warm_screen_execution_id ??
    payNested.warm_screen_execution_id;
  const warmItemId =
    prev.warm_screen_item_id ?? prevNested.warm_screen_item_id ?? payNested.warm_screen_item_id;

  const merged = { ...payload } as Record<string, unknown>;
  const mergedNested = { ...payNested, ...prevNested } as Record<string, unknown>;

  if (purpose === WARM_SCREEN_PURPOSE) {
    merged.purpose = WARM_SCREEN_PURPOSE;
    mergedNested.purpose = WARM_SCREEN_PURPOSE;
  }
  if (warmExecutionId != null) {
    merged.warm_screen_execution_id = warmExecutionId;
    mergedNested.warm_screen_execution_id = warmExecutionId;
  }
  if (warmItemId != null) {
    merged.warm_screen_item_id = warmItemId;
    mergedNested.warm_screen_item_id = warmItemId;
  }
  merged.metadata = mergedNested;
  return JSON.stringify(merged);
}
