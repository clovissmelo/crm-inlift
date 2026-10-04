export const TZ = "America/Sao_Paulo";

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

export type DashboardPeriod = "today" | "yesterday" | "week" | "7d" | "30d" | "all";

/** Segunda = 0 … domingo = 6 (calendário em America/Sao_Paulo). */
function spWeekdayMonFirst(date: Date): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(date);
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return map[wd] ?? 0;
}

function addDaysToYmd(year: number, month: number, day: number, delta: number) {
  const t = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

function ymdToSpNoonDate(year: number, month: number, day: number) {
  return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00-03:00`);
}

/** Rótulos YYYY-MM-DD de segunda-feira até hoje (SP), inclusive. */
export function spCurrentWeekDayLabels(): string[] {
  const now = new Date();
  const today = getSpParts(now);
  const daysFromMonday = spWeekdayMonFirst(now);
  const monday = addDaysToYmd(today.year, today.month, today.day, -daysFromMonday);
  const labels: string[] = [];
  for (let i = 0; i <= daysFromMonday; i++) {
    const d = addDaysToYmd(monday.year, monday.month, monday.day, i);
    labels.push(`${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`);
  }
  return labels;
}

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
  if (period === "week") {
    const today = getSpParts(now);
    const daysFromMonday = spWeekdayMonFirst(now);
    const monday = addDaysToYmd(today.year, today.month, today.day, -daysFromMonday);
    const monDate = ymdToSpNoonDate(monday.year, monday.month, monday.day);
    return { from: spDayStartUtcIso(monDate), to: spDayEndUtcIso(now) };
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

/** Valores para inputs `date` e `time` (fuso SP) a partir de ISO UTC. */
export function isoToSpDateAndTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(d);
  return { date, time };
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

/** Primeiro e último dia do mês de `refYmd` (YYYY-MM-DD em SP) */
export function monthBoundsYmd(refYmd?: string) {
  const anchor = refYmd ?? formatYmdInSp(new Date());
  const [y, m] = anchor.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

export function ymdRangeToClosedAtIso(fromYmd: string, toYmd: string) {
  return {
    from: spLocalDateTimeToIso(fromYmd, "00:00"),
    to: spLocalDateTimeToIso(toYmd, "23:59")
  };
}

function formatYmdInSp(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
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
