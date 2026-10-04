/** Emojis com seletor de apresentação (evita glifo “quadrado/diamante” em alguns clientes). */
export const WA = {
  chart: "\u{1F4CA}\uFE0F",
  person: "\u{1F464}\uFE0F",
  calendar: "\u{1F4C5}\uFE0F",
  package: "\u{1F4E6}\uFE0F",
  phone: "\u{1F4DE}\uFE0F",
  target: "\u{1F3AF}\uFE0F",
  trending: "\u{1F4C8}\uFE0F",
  trophy: "\u{1F3C6}\uFE0F",
  alert: "\u{1F6A8}\uFE0F",
  building: "\u{1F3E2}\uFE0F",
  mobile: "\u{1F4F1}\uFE0F",
  email: "\u{1F4E7}\uFE0F",
  clock: "\u{1F552}\uFE0F",
  laptop: "\u{1F4BB}\uFE0F",
  handshake: "\u{1F91D}\uFE0F",
  link: "\u{1F517}\uFE0F",
  people: "\u{1F465}\uFE0F"
} as const;

export function waBold(value: string): string {
  const safe = value.replace(/\*/g, "").trim();
  return safe ? `*${safe}*` : "—";
}

/** Ícone fora do negrito — formato recomendado pelo WhatsApp. */
export function waHeading(emoji: string, title: string): string {
  return `${emoji} ${waBold(title)}`;
}

export function waLabel(emoji: string, label: string, value: string): string {
  return `${emoji} ${label}: ${waBold(value)}`;
}

export function waBullet(label: string, value: string): string {
  return `• ${label}: ${waBold(value)}`;
}

/** WhatsApp ignora formatação se a mensagem termina em * ou _ */
export function prepareWhatsAppMessage(body: string): string {
  const normalized = body.normalize("NFC").trimEnd();
  if (normalized.endsWith("*") || normalized.endsWith("_")) return `${normalized} \u200B`;
  return normalized;
}

export function openWhatsAppShare(text: string): void {
  const prepared = prepareWhatsAppMessage(text);
  const url = `https://wa.me/?text=${encodeURIComponent(prepared)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
