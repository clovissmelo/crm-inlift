"use client";

import clsx from "clsx";
import { Check } from "lucide-react";
import type { ContactLayerChoice } from "@/lib/attendance/call-contact-layer";

const LABELS: Record<ContactLayerChoice, string> = {
  ninguem: "Ninguém",
  outra: "Outra pessoa",
  decisor: "Decisor"
};

type Props = {
  options: ContactLayerChoice[];
  value: ContactLayerChoice | null;
  onChange: (v: ContactLayerChoice) => void;
  disabled?: boolean;
  invalid?: boolean;
  locked?: boolean;
  lockedLabel?: string;
};

export function CallContactLayerField({
  options,
  value,
  onChange,
  disabled,
  invalid,
  locked,
  lockedLabel
}: Props) {
  if (options.length === 0) return null;

  if (locked && value) {
    return (
      <div className="field">
        <span className="label">Contato na ligação *</span>
        <p style={{ margin: 0, fontSize: "0.9375rem" }}>
          <strong>{lockedLabel ?? LABELS[value]}</strong>
        </p>
        {lockedLabel ? null : (
          <p className="muted" style={{ fontSize: "0.75rem", margin: "6px 0 0" }}>
            Definido automaticamente pelo resultado da ligação e comercial.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={invalid ? "field field--invalid" : "field"}>
      <span className="label">Contato na ligação *</span>
      <p className="muted" style={{ fontSize: "0.8125rem", margin: "0 0 0.5rem" }}>
        Quem participou da conversa?
      </p>
      <div className="call-contact-layer-picker" role="group" aria-label="Contato na ligação">
        {options.map((key) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              className={clsx("call-contact-layer-btn", active ? "is-active" : "is-inactive")}
              onClick={() => onChange(key)}
              aria-pressed={active}
            >
              {active ? <Check size={14} strokeWidth={2.5} aria-hidden className="call-contact-layer-btn-check" /> : null}
              {LABELS[key]}
            </button>
          );
        })}
      </div>
      {invalid ? <p className="call-reg-invalid-hint">Selecione com quem houve contato.</p> : null}
    </div>
  );
}
