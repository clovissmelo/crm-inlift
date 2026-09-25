const TZ = "America/Sao_Paulo";

export function nowInSpIso() {
  return new Date().toISOString();
}

/** Início do dia em SP convertido para UTC ISO para comparações no banco */
export function spDayStartUtcIso(date = new Date()) {
  const parts = getSpParts(date);
  const utcMs = Date.UTC(parts.year, parts.month - 1, parts.day, 3, 0, 0);
  return new Date(utcMs).toISOString();
}

export function spDayEndUtcIso(date = new Date()) {
  const parts = getSpParts(date);
  const utcMs = Date.UTC(parts.year, parts.month - 1, parts.day + 1, 2, 59, 59, 999);
  return new Date(utcMs).toISOString();
}

function getSpParts(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const [year, month, day] = fmt.format(date).split("-").map(Number);
  return { year, month, day };
}

export type DashboardPeriod = "today" | "yesterday" | "7d" | "30d" | "all";

export function periodToRange(period: DashboardPeriod): { from: string | null; to: string | null } {
  const now = new Date();
  if (period === "all") return { from: null, to: null };
  if (period === "today") {
    return { from: spDayStartUtcIso(now), to: spDayEndUtcIso(now) };
  }
  if (period === "yesterday") {
    const y = new Date(now.getTime() - 86400000);
    return { from: spDayStartUtcIso(y), to: spDayEndUtcIso(y) };
  }
  if (period === "7d") {
    const from = new Date(now.getTime() - 6 * 86400000);
    return { from: spDayStartUtcIso(from), to: spDayEndUtcIso(now) };
  }
  const from = new Date(now.getTime() - 29 * 86400000);
  return { from: spDayStartUtcIso(from), to: spDayEndUtcIso(now) };
}

export function spLocalDateTimeToIso(date: string, time: string) {
  return new Date(`${date}T${time}:00-03:00`).toISOString();
}

export function meetingEndIso(startsAtIso: string, durationMinutes: number) {
  return new Date(new Date(startsAtIso).getTime() + durationMinutes * 60_000).toISOString();
}

export function formatSpDateTime(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(iso));
}

export function formatSpDate(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    dateStyle: "short"
  }).format(new Date(iso));
}

/** Agrupa série temporal: por dia até 30d, por mês em "all" */
export function bucketKeyForApproach(iso: string, period: DashboardPeriod) {
  const d = new Date(iso);
  if (period === "all") {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, year: "numeric", month: "2-digit" }).format(d);
  }
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
