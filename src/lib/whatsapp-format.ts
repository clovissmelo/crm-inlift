/**
 * Emojis literais (UTF-8). Evite \uFE0F na URL do WhatsApp — em alguns navegadores
 * quebra o UTF-8 junto com *negrito* no preview do api.whatsapp.com.
 */
export const WA = {
  chart: "📊",
  person: "👤",
  calendar: "📅",
  package: "📦",
  phone: "📞",
  target: "🎯",
  trending: "📈",
  trophy: "🏆",
  alert: "🚨",
  building: "🏢",
  mobile: "📱",
  email: "📧",
  clock: "🕒",
  laptop: "💻",
  handshake: "🤝",
  link: "🔗",
  people: "👥"
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
  if (normalized.endsWith("*") || normalized.endsWith("_")) return `${normalized} `;
  return normalized;
}

