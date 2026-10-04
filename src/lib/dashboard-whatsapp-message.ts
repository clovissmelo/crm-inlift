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

function bold(value: string): string {
  const safe = value.replace(/\*/g, "").trim();
  return safe ? `*${safe}*` : "—";
}

/** WhatsApp ignora formatação se a mensagem termina em * ou _ */
function finalizeWhatsAppText(body: string): string {
  const trimmed = body.trimEnd();
  if (trimmed.endsWith("*") || trimmed.endsWith("_")) return `${trimmed} \u200B`;
  return trimmed;
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
    bold("📊 Fechamento Comercial"),
    `👤 BDR: ${bold(labels.bdr)}`,
    `📅 Período: ${bold(labels.period)}`,
    `📦 Produto: ${bold(labels.product)}`,
    "",
    bold("📞 Prospecção"),
    `• Leads trabalhados: ${bold(fmt(leads_worked))}`,
    `• Ligações realizadas: ${bold(fmt(calls_made))}`,
    `• Ligações que chamaram: ${bold(fmt(calls_rang))}`,
    `• Ligações atendidas: ${bold(fmt(calls_answered))}`,
    `• Contatos com decisores: ${bold(fmt(decision_maker_contacts))}`,
    "",
    bold("📞 Resultado das ligações"),
    `• Erro na ligação: ${bold(fmt(call_error))}`,
    `• Chamou e não atendeu: ${bold(fmt(call_no_answer))}`,
    `• Atendidas: ${bold(fmt(calls_answered))}`,
    "",
    bold("🎯 Resultado dos contatos"),
    `• Sem interesse: ${bold(fmt(no_interest))}`,
    `• Bloqueio por intermediário: ${bold(fmt(gatekeeper_block))}`,
    `• Retorno solicitado: ${bold(fmt(return_requested))}`,
    `• Reuniões agendadas: ${bold(fmt(meetings_scheduled))}`,
    "",
    bold("📈 Conversão"),
    `• Ligações que chamaram: ${bold(pct(calls_rang, calls_made))}`,
    `• Ligações atendidas: ${bold(pct(calls_answered, calls_rang))}`,
    `• Acesso ao decisor: ${bold(pct(decision_maker_contacts, calls_answered))}`,
    `• Leads → Reunião: ${bold(pct(meetings_scheduled, leads_worked))}`,
    ""
  ];

  if (period_key === "today") {
    lines.push(`🏆 ${bold(`${fmt(meetings_today)} reuniões agendadas hoje`)}`);
  } else if (meetings_scheduled > 0) {
    lines.push(`🏆 ${bold(`${fmt(meetings_scheduled)} reuniões agendadas no período`)}`);
  } else {
    lines.push(`🏆 ${bold("Nenhuma reunião agendada no período")}`);
  }

  return finalizeWhatsAppText(lines.join("\n"));
}

export function openDashboardWhatsAppShare(text: string) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
