import { TZ } from "@/lib/datetime";

export const DIAL_PICKER_RECENT_CALLS = 3;

/** Ex.: 02/10/2026 20:59 (sem vírgula entre data e hora). */
export function formatDialPickerCallTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  })
    .format(new Date(iso))
    .replace(", ", " ");
}

export function sortDialHistoryNewestFirst(times: string[]): string[] {
  return [...times].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
}

export function dialPickerStatusLine(callCount: number): string {
  if (callCount <= 0) return "Sem nenhum contato";
  return callCount === 1 ? "1 ligação realizada" : `${callCount} ligações realizadas`;
}
