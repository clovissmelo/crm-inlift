import { formatSpDateTime } from "@/lib/datetime";

export function formatDialHistoryDateLine(times: string[]): string | null {
  if (times.length === 0) return null;
  const labels = times.map((t) => formatSpDateTime(t));
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} e ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;
}

export function dialPickerStatusLine(callCount: number): string {
  if (callCount <= 0) return "Sem nenhum contato";
  return callCount === 1 ? "1 ligação realizada" : `${callCount} ligações realizadas`;
}
