"use client";

import {
  matchTechnicalResultFromCatalog,
  suggestedCommercialSlugForContact,
  suggestedCommercialSlugForTechnical,
  suggestedContactSlugForTechnical,
  type TechnicalResultTypeRow
} from "@/lib/classifications/technical-result-match";

export type ContactOutcomeOption = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  requires_conversation: boolean;
};

export type CommercialOption = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  requires_meeting?: boolean;
  require_schedule_return?: boolean;
  collect_notes?: boolean;
};

export function resolveCallTechnicalSlug(
  technicalTypes: TechnicalResultTypeRow[],
  input: {
    technical_slug?: string | null;
    hangup_cause_code?: string | null;
    hangup_cause_label?: string | null;
    duration_seconds?: number | null;
    answered_at?: string | null;
  }
): string | null {
  if (input.technical_slug) return input.technical_slug;
  const matched = matchTechnicalResultFromCatalog(technicalTypes, {
    hangup_cause_code: input.hangup_cause_code ?? null,
    hangup_cause_label: input.hangup_cause_label ?? null,
    duration_seconds: input.duration_seconds ?? null,
    answered_at: input.answered_at ?? null
  });
  return matched?.slug ?? null;
}

export function applyThreeLayerSuggestions(input: {
  technicalSlug: string | null;
  contactTypes: ContactOutcomeOption[];
  commercialTypes: CommercialOption[];
}): { contactId: string; commercialId: string; lockContact: boolean; lockCommercial: boolean } {
  const contactSlug = suggestedContactSlugForTechnical(input.technicalSlug);
  let commercialSlug = suggestedCommercialSlugForTechnical(input.technicalSlug);
  if (!commercialSlug && contactSlug) {
    commercialSlug = suggestedCommercialSlugForContact(contactSlug);
  }
  const contactId = contactSlug
    ? String(input.contactTypes.find((c) => c.slug === contactSlug)?.id ?? "")
    : "";
  const commercialId = commercialSlug
    ? String(input.commercialTypes.find((c) => c.slug === commercialSlug)?.id ?? "")
    : "";
  const autoLayer = Boolean(input.technicalSlug && input.technicalSlug !== "answered");
  return {
    contactId,
    commercialId,
    lockContact: autoLayer && Boolean(contactId),
    lockCommercial: autoLayer && Boolean(commercialId)
  };
}

export function CallThreeLayerRegistrationFields({
  technicalLabel,
  contactTypes,
  contactOutcomeId,
  onContactOutcomeChange,
  contactLocked,
  commercialTypes,
  compatIds,
  allowedCommercialIds,
  commercialId,
  onCommercialChange,
  commercialLocked,
  requiresConversation,
  contactedPersonName,
  onContactedPersonNameChange,
  contactedPersonJobTitle,
  onContactedPersonJobTitleChange,
  contactedPersonNotes,
  onContactedPersonNotesChange,
  disabled
}: {
  technicalLabel: string;
  contactTypes: ContactOutcomeOption[];
  contactOutcomeId: string;
  onContactOutcomeChange: (id: string) => void;
  contactLocked?: boolean;
  commercialTypes: CommercialOption[];
  compatIds: number[] | null;
  /** Quando definido (ex.: matriz técnico×comercial), filtra opções comerciais. */
  allowedCommercialIds?: number[] | null;
  commercialId: string;
  onCommercialChange: (id: string) => void;
  commercialLocked?: boolean;
  requiresConversation?: boolean;
  contactedPersonName: string;
  onContactedPersonNameChange: (v: string) => void;
  contactedPersonJobTitle: string;
  onContactedPersonJobTitleChange: (v: string) => void;
  contactedPersonNotes: string;
  onContactedPersonNotesChange: (v: string) => void;
  disabled?: boolean;
}) {
  const filteredCommercial =
    allowedCommercialIds && allowedCommercialIds.length > 0
      ? commercialTypes.filter((c) => allowedCommercialIds.includes(c.id))
      : compatIds && contactOutcomeId
        ? commercialTypes.filter((c) => compatIds.includes(c.id))
        : commercialTypes;

  return (
    <div className="call-three-layer-fields">
      <div className="field">
        <label className="label">Resultado da ligação (telefonia)</label>
        <p style={{ margin: 0, fontSize: "0.9375rem" }}>
          <strong>{technicalLabel || "Aguardando retorno da telefonia"}</strong>
        </p>
      </div>

      <div className="field">
        <label className="label">Resultado comercial *</label>
        {commercialLocked && commercialId ? (
          <p style={{ margin: 0, fontSize: "0.9375rem" }}>
            <strong>{commercialTypes.find((c) => String(c.id) === commercialId)?.name}</strong>
          </p>
        ) : (
          <select
            className="select"
            value={commercialId}
            onChange={(e) => onCommercialChange(e.target.value)}
            required
            disabled={disabled || filteredCommercial.length === 0}
          >
            <option value="">Selecione…</option>
            {filteredCommercial.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
        {filteredCommercial.length === 0 ? (
          <p className="muted" style={{ fontSize: "0.75rem", margin: "6px 0 0" }}>
            Nenhum resultado comercial associado a este resultado da ligação.
          </p>
        ) : null}
      </div>

      {contactTypes.length > 0 ? (
        <div className="field">
          <label className="label">Contato realizado *</label>
          {contactLocked && contactOutcomeId ? (
            <p style={{ margin: 0, fontSize: "0.9375rem" }}>
              <strong>{contactTypes.find((c) => String(c.id) === contactOutcomeId)?.name}</strong>
            </p>
          ) : (
            <select
              className="select"
              value={contactOutcomeId}
              onChange={(e) => onContactOutcomeChange(e.target.value)}
              required
              disabled={disabled || contactLocked}
            >
              <option value="">Selecione…</option>
              {contactTypes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {contactLocked ? (
            <p className="muted" style={{ fontSize: "0.75rem", margin: "6px 0 0" }}>
              Sugerido automaticamente pelo resultado técnico.
            </p>
          ) : null}
        </div>
      ) : null}

      {requiresConversation ? (
        <>
          <div className="field">
            <label className="label">Nome da pessoa *</label>
            <input
              className="input"
              value={contactedPersonName}
              onChange={(e) => onContactedPersonNameChange(e.target.value)}
              disabled={disabled}
              required
            />
          </div>
          <div className="field">
            <label className="label">Função / cargo</label>
            <input
              className="input"
              value={contactedPersonJobTitle}
              onChange={(e) => onContactedPersonJobTitleChange(e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label className="label">Observações sobre a pessoa</label>
            <textarea
              className="textarea"
              value={contactedPersonNotes}
              onChange={(e) => onContactedPersonNotesChange(e.target.value)}
              disabled={disabled}
              rows={2}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
