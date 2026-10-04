import {
  formatCallScriptLogAnswers,
  normalizeCallScriptLog,
  stripScriptBlockFromApproachNotes,
  type CallScriptLogEntry
} from "@/lib/call-script-log";
import { APPROACH_NEXT_ACTION_LABELS, type ApproachNextActionKey } from "@/lib/approach-next-actions";
import { CONTACT_ORIGIN } from "@/lib/contact-origin";
import { formatSpDateTime } from "@/lib/datetime";
import { formatPhoneDisplay } from "@/lib/format";
import { parseCallScriptBody } from "@/lib/script-flow";
import {
  contactPayloadFromCaptureNotes,
  mergeProfileTags
} from "@/lib/script-flow-capture-contact-utils";
import { screenContactTag, screenCreatesContact } from "@/lib/script-flow-screens";

/** Prévia de um item do histórico do cliente após ligação registrada. */
export type SimulatedClientTimelineItem = {
  title: string;
  detail: string | null;
  script_detail: string | null;
  occurred_at: string;
  user_name: string;
  /** Contatos que o roteiro criaria no cadastro do cliente (simulação). */
  contact_previews?: SimulatedContactPreview[];
};

export type SimulatedContactPreview = {
  name: string;
  job_title: string | null;
  phone: string | null;
  profile_tags: string[];
  origin: string;
  from_step_title: string | null;
};

export function simulatedContactsFromScriptLog(
  scriptFlowLog: CallScriptLogEntry[] | unknown,
  scriptBody: string | null | undefined
): SimulatedContactPreview[] {
  const log = normalizeCallScriptLog(scriptFlowLog);
  const flow = scriptBody?.trim() ? parseCallScriptBody(scriptBody) : null;
  if (!flow) return [];

  const byStep = new Map<string, SimulatedContactPreview>();
  for (const entry of log) {
    if (entry.action !== "capture" || !entry.capture_notes?.length) continue;
    const screen = flow.screens[entry.step_id];
    if (!screen || !screenCreatesContact(screen)) continue;
    const payload = contactPayloadFromCaptureNotes(entry.capture_notes);
    if (!payload) continue;
    const tag = screenContactTag(screen) ?? "PERFIL DECISOR";
    byStep.set(entry.step_id, {
      name: payload.name,
      job_title: payload.jobTitle,
      phone: payload.phone,
      profile_tags: mergeProfileTags([], tag),
      origin: CONTACT_ORIGIN.callScript,
      from_step_title: entry.step_title?.trim() || screen.title?.trim() || null
    });
  }
  return [...byStep.values()];
}

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
  scriptBody?: string | null;
  nextType: ApproachNextActionKey;
  nextScheduledAtIso: string | null;
  userName: string;
  occurredAt: string;
}): SimulatedClientTimelineItem {
  const scriptDetail =
    formatCallScriptLogAnswers(normalizeCallScriptLog(input.scriptFlowLog)) ?? null;
  const contactPreviews = simulatedContactsFromScriptLog(input.scriptFlowLog, input.scriptBody);

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
    user_name: input.userName,
    ...(contactPreviews.length ? { contact_previews: contactPreviews } : {})
  };
}
