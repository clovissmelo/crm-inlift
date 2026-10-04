/** Prefer the row with the newest `updated_at` (evita UI presa em activeRun stale). */
export function mergeRunRowByRecency<T extends { id: number; updated_at?: string }>(
  base: T | null | undefined,
  incoming: T
): T {
  if (!base || base.id !== incoming.id) return incoming;
  const a = base.updated_at ?? "";
  const b = incoming.updated_at ?? "";
  if (!a || !b) return { ...base, ...incoming };
  return b >= a ? { ...base, ...incoming } : base;
}
