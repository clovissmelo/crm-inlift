"use client";

import clsx from "clsx";
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
  compact
}: {
  value: LeadQualification;
  onChange: (next: LeadQualification) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={clsx("lead-qual-picker", compact && "lead-qual-picker-compact")} role="group" aria-label="Qualificação do lead">
      {LEAD_QUALIFICATION_ORDER.map((q) => (
        <button
          key={q}
          type="button"
          disabled={disabled}
          className={clsx("lead-qual-btn", LEAD_QUALIFICATION_CSS[q], value === q && "is-active")}
          onClick={() => onChange(q)}
          aria-pressed={value === q}
        >
          {LEAD_QUALIFICATION_LABELS[q]}
        </button>
      ))}
    </div>
  );
}

export function LeadQualificationBadge({ value }: { value: LeadQualification }) {
  return (
    <span className={clsx("lead-qual-badge", LEAD_QUALIFICATION_CSS[value])}>{LEAD_QUALIFICATION_LABELS[value]}</span>
  );
}
