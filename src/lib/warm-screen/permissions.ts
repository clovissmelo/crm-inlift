import type { User } from "@/lib/types";

export function isWarmScreenRunner(user: User): boolean {
  return (
    user.roles.includes("bdr") ||
    user.roles.includes("admin") ||
    user.roles.includes("manager")
  );
}

/** BDR só opera leads próprios; gestor/admin em todos. */
export function canWarmScreenLeadsForBdr(actor: User, targetBdrUserId: number | null | undefined): boolean {
  if (actor.roles.includes("admin") || actor.roles.includes("manager")) return true;
  if (!actor.roles.includes("bdr")) return false;
  if (targetBdrUserId == null) return true;
  return targetBdrUserId === actor.id;
}

export function canViewWarmScreenExecution(
  actor: User,
  execution: { runner_user_id: number; dial_user_id: number }
): boolean {
  if (actor.roles.includes("admin") || actor.roles.includes("manager")) return true;
  return execution.runner_user_id === actor.id || execution.dial_user_id === actor.id;
}
