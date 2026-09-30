import { getContactOutcomeTypeById } from "@/lib/classifications/contact-commercial";
import { isCommercialAllowedForTechnical } from "@/lib/classifications/result-associations";
import { getTechnicalResultTypeById, requiresContactSelection } from "@/lib/classifications/technical-result";
import { get } from "@/lib/db";

export type ApproachRegistrationInput = {
  channel: "call" | "whatsapp" | "email";
  registration_status: "draft" | "final";
  contact_outcome_type_id?: number | null;
  result_type_id: number;
  api4com_call_row_id?: number | null;
  contacted_person_name?: string | null;
  contacted_person_job_title?: string | null;
  linked_contact_id?: number | null;
};

export async function validateThreeLayerApproach(input: ApproachRegistrationInput): Promise<string | null> {
  if (input.channel !== "call") return null;
  if (input.registration_status === "draft") return null;
  if (!input.api4com_call_row_id) return null;

  let technicalSlug: string | null = null;
  let technicalTypeId: number | null = null;
  let answeredAt: string | null = null;
  if (input.api4com_call_row_id) {
    const call = await get<{ technical_result_type_id: number | null; answered_at: string | null }>(
      "SELECT technical_result_type_id, answered_at FROM api4com_calls WHERE id = @id",
      { id: input.api4com_call_row_id }
    );
    answeredAt = call?.answered_at ?? null;
    if (call?.technical_result_type_id) {
      technicalTypeId = call.technical_result_type_id;
      const t = await getTechnicalResultTypeById(call.technical_result_type_id);
      technicalSlug = t?.slug ?? null;
    }
  }

  let needsContact = requiresContactSelection(technicalSlug);
  if (!technicalSlug && answeredAt) needsContact = true;

  if (needsContact && !input.contact_outcome_type_id) {
    return "Informe o contato realizado (com quem houve conversa).";
  }

  if (!needsContact && !input.contact_outcome_type_id) {
    return "Informe o contato realizado.";
  }

  const contactType = input.contact_outcome_type_id
    ? await getContactOutcomeTypeById(input.contact_outcome_type_id)
    : null;
  if (!contactType || contactType.status !== "active") {
    return "Tipo de contato realizado inválido.";
  }

  const commercial = await get<{ id: number; status: string; layer: string }>(
    "SELECT id, status, layer FROM approach_result_types WHERE id = @id",
    { id: input.result_type_id }
  );
  if (!commercial || commercial.status !== "active" || commercial.layer !== "commercial") {
    return "Resultado comercial inválido.";
  }

  if (technicalTypeId != null) {
    const allowed = await isCommercialAllowedForTechnical(technicalTypeId, input.result_type_id);
    if (!allowed) {
      return "Este resultado comercial não está associado ao resultado da ligação desta chamada.";
    }
  } else {
    const { isCommercialCompatible } = await import("@/lib/classifications/contact-commercial");
    const compatible = await isCommercialCompatible(input.contact_outcome_type_id!, input.result_type_id);
    if (!compatible) {
      return "Este resultado comercial não é compatível com o contato realizado selecionado.";
    }
  }

  if (contactType.requires_conversation) {
    const hasPerson =
      Boolean(input.contacted_person_name?.trim()) ||
      Boolean(input.linked_contact_id);
    if (!hasPerson) {
      return "Informe a pessoa contatada ou vincule um contato do cliente.";
    }
  }

  return null;
}
