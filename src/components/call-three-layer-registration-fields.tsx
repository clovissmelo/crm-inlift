"use client";

import { Pencil } from "lucide-react";
import { CallContactLayerField } from "@/components/call-contact-layer-field";
import {
  matchTechnicalResultFromCatalog,
  suggestedCommercialSlugForContact,
  suggestedCommercialSlugForTechnical,
  suggestedContactSlugForTechnical,
  type TechnicalResultTypeRow
} from "@/lib/classifications/technical-result-match";
import { callTelephonyResultLabel } from "@/lib/api4com/call-registration";
import type { ContactLayerChoice } from "@/lib/attendance/call-contact-layer";
import { resolveContactLayerOptions } from "@/lib/attendance/call-contact-layer";

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
  callAnswered,
  technicalSlug,
  technicalLabel,
  contactTypes,
  contactLayerChoice,
  onContactLayerChoiceChange,
  contactLayerLocked,
  commercialTypes,
  allowedCommercialIds,
  commercialId,
  onCommercialChange,
  commercialLocked,
  compatMap,
  contactedPersonName,
  onContactedPersonNameChange,
  contactedPersonJobTitle,
  onContactedPersonJobTitleChange,
  personFieldsCompact,
  onEditPersonFields,
  invalidFields,
  disabled
}: {
  callAnswered: boolean;
  technicalSlug?: string | null;
  technicalLabel: string;
  contactTypes: ContactOutcomeOption[];
  contactLayerChoice: ContactLayerChoice | null;
  onContactLayerChoiceChange: (v: ContactLayerChoice) => void;
  contactLayerLocked?: boolean;
  commercialTypes: CommercialOption[];
  allowedCommercialIds?: number[] | null;
  commercialId: string;
  onCommercialChange: (id: string) => void;
  commercialLocked?: boolean;
  compatMap: Record<string, number[]>;
  contactedPersonName: string;
  onContactedPersonNameChange: (v: string) => void;
  contactedPersonJobTitle: string;
  onContactedPersonJobTitleChange: (v: string) => void;
  /** Nome/cargo já vieram do roteiro — mostra resumo com lápis em vez dos campos. */
  personFieldsCompact?: boolean;
  onEditPersonFields?: () => void;
  invalidFields?: Partial<
    Record<"commercial" | "contact" | "personName" | "personJob", boolean>
  >;
  disabled?: boolean;
}) {
  const filteredCommercial =
    allowedCommercialIds && allowedCommercialIds.length > 0
      ? commercialTypes.filter((c) => allowedCommercialIds.includes(c.id))
      : commercialTypes;

  const selectedCommercial = commercialTypes.find((c) => String(c.id) === commercialId);
  const nenhumType = contactTypes.find((c) => c.slug === "nenhum_contato");
  const layerOptions = resolveContactLayerOptions({
    callAnswered,
    commercialSlug: selectedCommercial?.slug ?? null,
    nenhumContatoTypeId: nenhumType?.id ?? null,
    commercialTypeId: selectedCommercial?.id ?? null,
    compatMap
  });

  const showPersonFields =
    contactLayerChoice === "outra" || contactLayerChoice === "decisor";

  const telephonyDetail =
    callTelephonyResultLabel(technicalSlug, technicalLabel) ||
    (callAnswered ? "Atendeu" : "Chamou e não atendeu");

  return (
    <div className="call-three-layer-fields">
      <div className="call-reg-header-block call-reg-header-block--answered field">
        <span className="label">Atendeu?</span>
        <p className="call-reg-answered-value">
          <strong>{callAnswered ? "Sim" : "Não"}</strong>
          <span className="muted"> · {telephonyDetail}</span>
        </p>
      </div>

      <div className={invalidFields?.commercial ? "field field--invalid" : "field"}>
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
            Nenhum resultado comercial disponível para esta ligação.
          </p>
        ) : null}
        {invalidFields?.commercial ? (
          <p className="call-reg-invalid-hint">Selecione o resultado comercial.</p>
        ) : null}
      </div>

      {commercialId ? (
        <CallContactLayerField
          options={layerOptions}
          value={contactLayerChoice}
          onChange={onContactLayerChoiceChange}
          disabled={disabled}
          invalid={invalidFields?.contact}
          locked={contactLayerLocked}
          lockedLabel={
            contactLayerLocked && contactLayerChoice === "ninguem" && !callAnswered
              ? "Ninguém (não atendeu)"
              : contactLayerLocked && contactLayerChoice === "ninguem"
                ? "Ninguém"
                : undefined
          }
        />
      ) : null}

      {showPersonFields ? (
        <div className={invalidFields?.personName ? "field field--invalid" : "field"}>
          {personFieldsCompact && contactedPersonName.trim() ? (
            <div className="call-reg-person-summary">
              <div className="call-reg-person-summary-head">
                <span className="label">
                  {contactLayerChoice === "decisor" ? "Nome do decisor" : "Nome de quem atendeu"}
                </span>
                <button
                  type="button"
                  className="btn btn-icon-sm"
                  title="Editar nome e cargo"
                  disabled={disabled}
                  onClick={() => onEditPersonFields?.()}
                >
                  <Pencil size={16} aria-hidden />
                </button>
              </div>
              <p className="call-reg-person-summary-body">
                <strong>{contactedPersonName}</strong>
                {contactedPersonJobTitle.trim() ? (
                  <span className="muted"> · {contactedPersonJobTitle}</span>
                ) : null}
              </p>
              <p className="muted" style={{ fontSize: "0.75rem", margin: "6px 0 0" }}>
                Preenchido no roteiro da ligação.
              </p>
            </div>
          ) : (
            <div className="call-reg-person-row">
              <div className="call-reg-person-row-col">
                <label className="label">
                  {contactLayerChoice === "decisor" ? "Nome do decisor *" : "Nome de quem atendeu *"}
                </label>
                <input
                  className="input"
                  value={contactedPersonName}
                  onChange={(e) => onContactedPersonNameChange(e.target.value)}
                  disabled={disabled}
                  required
                />
              </div>
              <div className="call-reg-person-row-col">
                <label className="label">Função / cargo</label>
                <input
                  className="input"
                  value={contactedPersonJobTitle}
                  onChange={(e) => onContactedPersonJobTitleChange(e.target.value)}
                  disabled={disabled}
                />
              </div>
            </div>
          )}
          {invalidFields?.personName ? (
            <p className="call-reg-invalid-hint">Informe o nome para o histórico.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
