import { spDayEndUtcIso, spDayStartUtcIso } from "@/lib/datetime";

const TZ = "America/Sao_Paulo";

export type CalendarRangeKind = "day" | "week" | "month";

export function formatYmdInSp(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function parseYmd(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return { year: y, month: m, day: d };
}

function dateAtSpNoon(ymd: string) {
  const { year, month, day } = parseYmd(ymd);
  return new Date(Date.UTC(year, month - 1, day, 15, 0, 0));
}

/** 0 = domingo … 6 = sábado (calendário em SP) */
export function weekdayInSp(ymd: string) {
  const d = dateAtSpNoon(ymd);
  const name = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[name] ?? 0;
}

export function addDaysYmd(ymd: string, days: number) {
  const d = dateAtSpNoon(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return formatYmdInSp(d);
}

export function addMonthsYmd(ymd: string, months: number) {
  const { year, month, day } = parseYmd(ymd);
  const d = new Date(Date.UTC(year, month - 1 + months, 1, 15, 0, 0));
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);
  return formatYmdInSp(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), clampedDay, 15, 0, 0)));
}

export function shiftCalendarAnchor(kind: CalendarRangeKind, anchorYmd: string, direction: -1 | 1) {
  if (kind === "day") return addDaysYmd(anchorYmd, direction);
  if (kind === "week") return addDaysYmd(anchorYmd, direction * 7);
  return addMonthsYmd(anchorYmd, direction);
}

export function weekDaysFromAnchor(anchorYmd: string) {
  const dow = weekdayInSp(anchorYmd);
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = addDaysYmd(anchorYmd, mondayOffset);
  return Array.from({ length: 7 }, (_, i) => addDaysYmd(monday, i));
}

/** Segunda a sexta (semana comercial) */
export function workWeekDaysFromAnchor(anchorYmd: string) {
  return weekDaysFromAnchor(anchorYmd).slice(0, 5);
}

export function monthGridDays(anchorYmd: string) {
  const { year, month } = parseYmd(anchorYmd);
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const firstDow = weekdayInSp(first);
  const mondayOffset = firstDow === 0 ? -6 : 1 - firstDow;
  const gridStart = addDaysYmd(first, mondayOffset);
  return Array.from({ length: 42 }, (_, i) => addDaysYmd(gridStart, i));
}

export function calendarRangeToUtcIso(kind: CalendarRangeKind, anchorYmd: string) {
  if (kind === "day") {
    const d = dateAtSpNoon(anchorYmd);
    return { from: spDayStartUtcIso(d), to: spDayEndUtcIso(d) };
  }
  if (kind === "week") {
    const days = workWeekDaysFromAnchor(anchorYmd);
    const start = dateAtSpNoon(days[0]!);
    const end = dateAtSpNoon(days[4]!);
    return { from: spDayStartUtcIso(start), to: spDayEndUtcIso(end) };
  }
  const { year, month } = parseYmd(anchorYmd);
  const firstYmd = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastYmd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return {
    from: spDayStartUtcIso(dateAtSpNoon(firstYmd)),
    to: spDayEndUtcIso(dateAtSpNoon(lastYmd))
  };
}

export function formatCalendarNavTitle(kind: CalendarRangeKind, anchorYmd: string) {
  const anchorDate = dateAtSpNoon(anchorYmd);
  if (kind === "day") {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: TZ,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(anchorDate);
  }
  if (kind === "week") {
    const days = workWeekDaysFromAnchor(anchorYmd);
    const start = dateAtSpNoon(days[0]!);
    const end = dateAtSpNoon(days[4]!);
    const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "numeric", month: "short" });
    const y = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, year: "numeric" }).format(anchorDate);
    return `${fmt.format(start)} – ${fmt.format(end)}, ${y}`;
  }
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, month: "long", year: "numeric" }).format(anchorDate);
}

export function formatDayHeader(ymd: string) {
  const d = dateAtSpNoon(ymd);
  const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "short" }).format(d);
  const day = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "numeric" }).format(d);
  return { weekday, day, ymd };
}

export function meetingDayKeyInSp(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(iso));
}

export function meetingMinutesFromMidnightSp(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function formatHourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}
