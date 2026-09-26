"use client";

import clsx from "clsx";
import { Check } from "lucide-react";
import {
  LEAD_QUALIFICATION_CSS,
  LEAD_QUALIFICATION_LABELS,
  LEAD_QUALIFICATION_ORDER,
  type LeadQualification
} from "@/lib/lead-qualification";

export function LeadQualificationPicker({
  value,
  onChange,
  disabled,
  compact,
  showCurrentLabel = true
}: {
  value: LeadQualification;
  onChange: (next: LeadQualification) => void;
  disabled?: boolean;
  compact?: boolean;
  /** Exibe “Status atual: …” acima dos botões (desligue em formulários compactos). */
  showCurrentLabel?: boolean;
}) {
  return (
    <div className={clsx("lead-qual-picker-wrap", compact && "lead-qual-picker-wrap-compact")}>
      {showCurrentLabel && !compact ? (
        <p className="lead-qual-current-line" aria-live="polite">
          Status atual:{" "}
          <span className={clsx("lead-qual-current-pill", LEAD_QUALIFICATION_CSS[value], "is-active")}>
            {LEAD_QUALIFICATION_LABELS[value]}
          </span>
        </p>
      ) : null}
      <div className={clsx("lead-qual-picker", compact && "lead-qual-picker-compact")} role="group" aria-label="Qualificação do lead">
        {LEAD_QUALIFICATION_ORDER.map((q) => {
          const active = value === q;
          return (
            <button
              key={q}
              type="button"
              disabled={disabled}
              className={clsx(
                "lead-qual-btn",
                LEAD_QUALIFICATION_CSS[q],
                active ? "is-active" : "is-inactive"
              )}
              onClick={() => onChange(q)}
              aria-pressed={active}
              aria-current={active ? "true" : undefined}
            >
              {active ? <Check size={14} strokeWidth={2.5} aria-hidden className="lead-qual-btn-check" /> : null}
              {LEAD_QUALIFICATION_LABELS[q]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LeadQualificationBadge({ value }: { value: LeadQualification }) {
  return (
    <span className={clsx("lead-qual-badge", LEAD_QUALIFICATION_CSS[value])}>{LEAD_QUALIFICATION_LABELS[value]}</span>
  );
}
