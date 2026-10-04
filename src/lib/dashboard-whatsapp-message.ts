import type { DashboardWhatsAppReport } from "@/lib/dashboard-stats-types";
import { prepareWhatsAppMessage, WA, waBold, waBullet, waHeading, waLabel } from "@/lib/whatsapp-format";

export type DashboardWhatsAppFilterLabels = {
  bdr: string;
  product: string;
  period: string;
  all_products?: boolean;
  /** Nomes na ordem de exibição (filtro Todos). */
  product_names?: string[];
};

function fmt(n: number): string {
  return String(n);
}

function fmtMeetingsTotal(n: number): string {
  return String(n).padStart(2, "0");
}

function pct(num: number, den: number): string {
  if (den <= 0) return "0,0%";
  return `${((100 * num) / den).toFixed(1).replace(".", ",")}%`;
}

function formatProductNamesLine(names: string[]): string {
  if (names.length === 0) return waLabel(WA.package, "Produtos", "—");
  return `${WA.package} Produtos: ${names.map((n) => waBold(n)).join(" • ")}`;
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
    meetings_by_product
  } = report;

  const lines: string[] = [
    waHeading(WA.chart, "Fechamento Comercial"),
    waLabel(WA.person, "BDR", labels.bdr),
    waLabel(WA.calendar, "Período", labels.period)
  ];

  if (labels.all_products) {
    lines.push(formatProductNamesLine(labels.product_names ?? []));
  } else {
    lines.push(waLabel(WA.package, "Produto", labels.product));
  }

  lines.push(
    "",
    waHeading(WA.phone, "Prospecção"),
    waBullet("Leads trabalhados", fmt(leads_worked)),
    waBullet("Ligações realizadas", fmt(calls_made)),
    waBullet("Ligações que chamaram", fmt(calls_rang)),
    waBullet("Ligações atendidas", fmt(calls_answered)),
    waBullet("Contatos com decisores", fmt(decision_maker_contacts)),
    "",
    waHeading(WA.phone, "Resultado das ligações"),
    waBullet("Erro na ligação", fmt(call_error)),
    waBullet("Chamou e não atendeu", fmt(call_no_answer)),
    waBullet("Atendidas", fmt(calls_answered)),
    "",
    waHeading(WA.target, "Resultado dos contatos"),
    waBullet("Sem interesse", fmt(no_interest)),
    waBullet("Bloqueio por intermediário", fmt(gatekeeper_block)),
    waBullet("Retorno solicitado", fmt(return_requested)),
    waBullet("Reuniões agendadas", fmt(meetings_scheduled)),
    "",
    waHeading(WA.trending, "Conversão"),
    waBullet("Ligações que chamaram", pct(calls_rang, calls_made)),
    waBullet("Ligações atendidas", pct(calls_answered, calls_rang)),
    waBullet("Acesso ao decisor", pct(decision_maker_contacts, calls_answered)),
    waBullet("Leads → Reunião", pct(meetings_scheduled, leads_worked)),
    "",
    `${WA.trophy} ${waBold(`${fmtMeetingsTotal(meetings_scheduled)} reuniões agendadas`)}`
  );

  for (const row of meetings_by_product) {
    lines.push(`• ${row.product_name}: ${waBold(String(row.count))}`);
  }

  return prepareWhatsAppMessage(lines.join("\n"));
}
