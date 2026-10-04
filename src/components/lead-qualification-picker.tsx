"use client";

import clsx from "clsx";
import { Flame, Snowflake, SunMedium, type LucideIcon } from "lucide-react";
import {
  LEAD_QUALIFICATION_CSS,
  LEAD_QUALIFICATION_LABELS,
  LEAD_QUALIFICATION_ORDER,
  type LeadQualification
} from "@/lib/lead-qualification";

const LEAD_QUALIFICATION_ICONS: Record<LeadQualification, LucideIcon> = {
  cold: Snowflake,
  warm: SunMedium,
  hot: Flame
};

export function LeadQualificationIcon({
  value,
  size = 14,
  className
}: {
  value: LeadQualification;
  size?: number;
  className?: string;
}) {
  const Icon = LEAD_QUALIFICATION_ICONS[value];
  return <Icon size={size} strokeWidth={2} aria-hidden className={clsx("lead-qual-icon", className)} />;
}

/** Ícone + rótulo (herda a cor do texto do elemento pai). */
export function LeadQualificationLabel({ value }: { value: LeadQualification }) {
  return (
    <>
      <LeadQualificationIcon value={value} size={13} />
      {LEAD_QUALIFICATION_LABELS[value]}
    </>
  );
}

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
            <LeadQualificationLabel value={value} />
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
              <LeadQualificationLabel value={q} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LeadQualificationBadge({ value }: { value: LeadQualification }) {
  return (
    <span className={clsx("lead-qual-badge", LEAD_QUALIFICATION_CSS[value])}>
      <LeadQualificationLabel value={value} />
    </span>
  );
}
