import { getSystemSetting } from "@/lib/system-settings";
import type { Api4comTokenPolicy } from "@/lib/api4com/token-policy-shared";

export type { Api4comTokenPolicy } from "@/lib/api4com/token-policy-shared";

export async function getApi4comTokenPolicy(): Promise<Api4comTokenPolicy> {
  const row = await getSystemSetting("api4com_token_policy");
  const v = row?.value?.trim();
  if (v === "per_bdr") return "per_bdr";
  return "global";
}

export function isApi4comTokenPolicy(value: string): value is Api4comTokenPolicy {
  return value === "global" || value === "per_bdr";
}
