import type { DashboardWhatsAppReport } from "@/lib/dashboard-stats";

export type DashboardWhatsAppFilterLabels = {
  bdr: string;
  product: string;
  period: string;
};

function fmt(n: number): string {
  return String(n);
}

function pct(num: number, den: number): string {
  if (den <= 0) return "0,0%";
  return `${((100 * num) / den).toFixed(1).replace(".", ",")}%`;
}

export function buildDashboardWhatsAppMessage(
  report: DashboardWhatsAppReport,
  labels: DashboardWhatsAppFilterLabels
): string {
  const {
    leads_worked,
    calls_made,
    calls_rang,
    calls_answered,
    decision_maker_contacts,
    call_error,
    call_no_answer,
    no_interest,
    gatekeeper_block,
    return_requested,
    meetings_scheduled,
    meetings_today,
    period_key
  } = report;

  const lines: string[] = [
    "📊 *Fechamento Comercial*",
    `👤 BDR: *${labels.bdr}*`,
    `📅 Período: *${labels.period}*`,
    `📦 Produto: *${labels.product}*`,
    "",
    "📞 *Prospecção*",
    `• Leads trabalhados: *${fmt(leads_worked)}*`,
    `• Ligações realizadas: *${fmt(calls_made)}*`,
    `• Ligações que chamaram: *${fmt(calls_rang)}*`,
    `• Ligações atendidas: *${fmt(calls_answered)}*`,
    `• Contatos com decisores: *${fmt(decision_maker_contacts)}*`,
    "",
    "📞 *Resultado das ligações*",
    `• Erro na ligação: *${fmt(call_error)}*`,
    `• Chamou e não atendeu: *${fmt(call_no_answer)}*`,
    `• Atendidas: *${fmt(calls_answered)}*`,
    "",
    "🎯 *Resultado dos contatos*",
    `• Sem interesse: *${fmt(no_interest)}*`,
    `• Bloqueio por intermediário: *${fmt(gatekeeper_block)}*`,
    `• Retorno solicitado: *${fmt(return_requested)}*`,
    `• Reuniões agendadas: *${fmt(meetings_scheduled)}*`,
    "",
    "📈 *Conversão*",
    `• Ligações que chamaram: *${pct(calls_rang, calls_made)}*`,
    `• Ligações atendidas: *${pct(calls_answered, calls_rang)}*`,
    `• Acesso ao decisor: *${pct(decision_maker_contacts, calls_answered)}*`,
    `• Leads → Reunião: *${pct(meetings_scheduled, leads_worked)}*`,
    ""
  ];

  if (period_key === "today") {
    lines.push(`🏆 *${fmt(meetings_today)} reuniões agendadas hoje*`);
  } else if (meetings_scheduled > 0) {
    lines.push(`🏆 *${fmt(meetings_scheduled)} reuniões agendadas no período*`);
  } else {
    lines.push("🏆 *Nenhuma reunião agendada no período*");
  }

  return lines.join("\n");
}

export function openDashboardWhatsAppShare(text: string) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
