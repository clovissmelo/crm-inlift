import {
  formatCallScriptLogAnswers,
  normalizeCallScriptLog,
  stripScriptBlockFromApproachNotes,
  type CallScriptLogEntry
} from "@/lib/call-script-log";
import { APPROACH_NEXT_ACTION_LABELS, type ApproachNextActionKey } from "@/lib/approach-next-actions";
import { formatSpDateTime } from "@/lib/datetime";
import { formatPhoneDisplay } from "@/lib/format";

/** Prévia de um item do histórico do cliente após ligação registrada. */
export type SimulatedClientTimelineItem = {
  title: string;
  detail: string | null;
  script_detail: string | null;
  occurred_at: string;
  user_name: string;
};

export function buildSimulatedRegisteredCallTimelineItem(input: {
  phoneDialed: string;
  durationSeconds: number | null;
  technicalLabel: string;
  productName: string | null;
  commercialResultName: string;
  contactOutcomeName: string;
  contactedPersonName: string | null;
  spokeWithDecisionMaker: boolean | null;
  notes: string | null;
  scriptFlowLog: CallScriptLogEntry[] | unknown;
  nextType: ApproachNextActionKey;
  nextScheduledAtIso: string | null;
  userName: string;
  occurredAt: string;
}): SimulatedClientTimelineItem {
  const scriptDetail =
    formatCallScriptLogAnswers(normalizeCallScriptLog(input.scriptFlowLog)) ?? null;

  let nextLabel: string | null = null;
  if (input.nextType === "schedule_return" || input.nextType === "schedule_meeting") {
    nextLabel = input.nextScheduledAtIso
      ? `${APPROACH_NEXT_ACTION_LABELS[input.nextType]}: ${formatSpDateTime(input.nextScheduledAtIso)}`
      : APPROACH_NEXT_ACTION_LABELS[input.nextType];
  } else if (input.nextType !== "none") {
    nextLabel = APPROACH_NEXT_ACTION_LABELS[input.nextType];
  }

  const bdrParts = [
    input.contactOutcomeName ? `Contato: ${input.contactOutcomeName}` : null,
    input.spokeWithDecisionMaker === true
      ? "Decisor: Sim"
      : input.spokeWithDecisionMaker === false
        ? "Decisor: Não"
        : null,
    input.contactedPersonName ? `Pessoa: ${input.contactedPersonName}` : null,
    input.commercialResultName ? `Comercial: ${input.commercialResultName}` : null,
    input.notes ? stripScriptBlockFromApproachNotes(input.notes) || null : null,
    nextLabel
  ].filter(Boolean) as string[];

  const techParts = [
    formatPhoneDisplay(input.phoneDialed),
    input.durationSeconds != null ? `${input.durationSeconds}s` : null,
    input.technicalLabel ? `Técnico: ${input.technicalLabel}` : null
  ].filter(Boolean);

  const detailParts = [input.productName, ...techParts, ...bdrParts].filter(Boolean) as string[];

  return {
    title: "Ligação registrada",
    detail: detailParts.join(" · ") || null,
    script_detail: scriptDetail,
    occurred_at: input.occurredAt,
    user_name: input.userName
  };
}
