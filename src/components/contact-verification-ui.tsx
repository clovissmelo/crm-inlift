"use client";

import clsx from "clsx";
import { BadgeCheck, CircleHelp, X } from "lucide-react";
import type { ContactVerification } from "@/lib/types";
import { VERIFICATION_LABELS } from "@/lib/types";

const VERIFICATION_PICKER_ORDER: ContactVerification[] = [
  "confirmed",
  "unverified",
  "invalid_number",
  "wrong_contact"
];

export function VerificationStatusIcon({
  status,
  size = 18,
  className
}: {
  status: ContactVerification | undefined;
  size?: number;
  className?: string;
}) {
  const s = status ?? "unverified";
  if (s === "confirmed") {
    return (
      <BadgeCheck
        size={size}
        aria-hidden
        className={clsx("contact-verification-icon contact-verification-icon--ok", className)}
      />
    );
  }
  if (s === "invalid_number" || s === "wrong_contact") {
    return (
      <X
        size={size}
        aria-hidden
        className={clsx("contact-verification-icon contact-verification-icon--bad", className)}
      />
    );
  }
  return (
    <CircleHelp
      size={size}
      aria-hidden
      className={clsx("contact-verification-icon contact-verification-icon--unknown", className)}
    />
  );
}

export function ContactVerificationPicker({
  value,
  onChange,
  disabled
}: {
  value: ContactVerification;
  onChange: (v: ContactVerification) => void;
  disabled?: boolean;
}) {
  return (
    <div className="contact-verification-picker" role="radiogroup" aria-label="Verificação do número">
      {VERIFICATION_PICKER_ORDER.map((key) => {
        const active = value === key;
        const isBad = key === "invalid_number" || key === "wrong_contact";
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            className={clsx(
              "contact-verification-option",
              active && "contact-verification-option--active",
              isBad && "contact-verification-option--bad"
            )}
            onClick={() => onChange(key)}
          >
            <VerificationStatusIcon status={key} size={17} />
            <span>{VERIFICATION_LABELS[key]}</span>
          </button>
        );
      })}
    </div>
  );
}
