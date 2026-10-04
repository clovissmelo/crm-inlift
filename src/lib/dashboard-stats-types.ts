import type { DashboardPeriod } from "@/lib/datetime";

export type DashboardStatsFilters = {
  period?: DashboardPeriod;
  product_id?: string | null;
  bdr_user_id?: string | null;
  owner_user_id?: string | null;
  lead_qualification?: "cold" | "warm" | "hot" | null;
};

export type DashboardWhatsAppReport = {
  leads_worked: number;
  calls_made: number;
  calls_rang: number;
  calls_answered: number;
  decision_maker_contacts: number;
  call_error: number;
  call_no_answer: number;
  no_interest: number;
  gatekeeper_block: number;
  return_requested: number;
  meetings_scheduled: number;
  meetings_today: number;
  period_key: DashboardPeriod;
};

export type DashboardStatsPayload = {
  total_clients: number;
  clients_with_verified_phone: number;
  clients_without_approach: number;
  clients_by_bdr: Array<{ bdr_user_id: number | null; bdr_name: string; count: number }>;
  unique_clients_attempted: number;
  decision_maker_contacts: number;
  clients_available_for_contact: number;
  approaches_by_channel: Array<{ channel: string; count: number }>;
  call_results: Array<{ result: string; count: number }>;
  pending_returns: number;
  approaches_by_bdr: Array<{ bdr_name: string; count: number }>;
  approaches_series: Array<{ label: string; count: number }>;
  approaches_timeline: {
    labels: string[];
    series: Array<{ channel: string; values: number[] }>;
  };
  clients_reached: number;
  bdr_activity: Array<{ bdr_name: string; approaches: number; meetings: number; clients: number }>;
  meetings_scheduled: number;
  meetings_confirmed: number;
  meetings_held: number;
  meetings_no_show: number;
  open_opportunities: number;
  proposals_sent: number;
  deals_converted: number;
  approaches_total: number;
  returns_overdue: number;
  returns_today: number;
  meetings_today: number;
  meetings_upcoming: number;
  qualification: { cold: number; warm: number; hot: number };
  focus_items: Array<{
    type: "return" | "meeting";
    id: number;
    client_id: number;
    label: string;
    client_name: string;
    at: string;
    overdue: boolean;
  }>;
  period: DashboardPeriod;
  activity_metrics_available: boolean;
  whatsapp_report: DashboardWhatsAppReport;
};
