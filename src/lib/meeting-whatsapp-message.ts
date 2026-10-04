import { prepareWhatsAppMessage, WA } from "@/lib/whatsapp-format";

export type MeetingWhatsAppDetail = {
  meeting: Record<string, unknown>;
  internal_participants: Array<{ id: number; name: string }>;
  external_participants: Array<{ email: string; display_name: string | null; phone?: string | null }>;
};

const TZ = "America/Sao_Paulo";

function firstName(full: string): string {
  const t = full.trim();
  if (!t) return full;
  return t.split(/\s+/)[0] ?? t;
}

function formatMeetLink(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone?.trim()) return "—";
  return phone.trim();
}

export function buildMeetingWhatsAppInvite(detail: MeetingWhatsAppDetail, clientNameFallback?: string): string {
  const m = detail.meeting;
  const company =
    String(m.client_name ?? clientNameFallback ?? "").trim() ||
    clientNameFallback?.trim() ||
    "Cliente";
  const product = m.product_name ? String(m.product_name) : "—";

  const linkedContactName = m.contact_name ? String(m.contact_name) : null;
  const linkedPhone = m.contact_phone ? String(m.contact_phone) : null;
  const linkedEmail = m.contact_email ? String(m.contact_email) : null;

  const ext = detail.external_participants[0];
  const extPhone = ext?.phone?.trim() || null;

  const contactName =
    linkedContactName?.trim() ||
    ext?.display_name?.trim() ||
    (ext?.email ? ext.email.split("@")[0] : null) ||
    "—";
  const contactPhone = formatPhoneDisplay(linkedPhone || extPhone);
  const contactEmail = linkedEmail?.trim() || ext?.email?.trim() || "—";

  const startsAt = String(m.starts_at);
  const datePart = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(startsAt));
  const timePart = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(startsAt));
  const dateTimeLabel = `${datePart} ${timePart}`;

  const meetLink = m.meet_link ? String(m.meet_link) : null;
  const linkLine = meetLink ? formatMeetLink(meetLink) : "—";

  const bdrUserId = m.bdr_user_id != null ? Number(m.bdr_user_id) : null;
  const bdrFull = m.bdr_name ? String(m.bdr_name) : detail.internal_participants.find((p) => p.id === bdrUserId)?.name;
  const bdrLabel = bdrFull ? firstName(bdrFull) : "—";

  const participantNames = detail.internal_participants
    .filter((p) => bdrUserId == null || p.id !== bdrUserId)
    .map((p) => p.name.trim())
    .filter(Boolean);

  const lines: string[] = [
    `${WA.alert} Nova Reunião Agendada`,
    `Empresa: ${company}`,
    `Produto: ${product}`,
    `BDR: ${bdrLabel}`,
    "",
    `${WA.person} Contato: ${contactName}`,
    `Telefone: ${contactPhone}`,
    `E-mail: ${contactEmail}`,
    "",
    `${WA.calendar} Data: ${dateTimeLabel}`,
    `${WA.link} Link: ${linkLine}`,
    "",
    `${WA.people} Participantes`
  ];

  if (participantNames.length === 0) {
    lines.push("* —");
  } else {
    for (const name of participantNames) {
      lines.push(`* ${name}`);
    }
  }

  return prepareWhatsAppMessage(lines.join("\n"));
}
