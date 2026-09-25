export type MeetingStatus = "scheduled" | "confirmed" | "held" | "no_show" | "cancelled" | "rescheduled";

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  held: "Realizado",
  no_show: "Cliente não compareceu",
  cancelled: "Cancelado",
  rescheduled: "Reagendado"
};
