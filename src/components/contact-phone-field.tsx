"use client";

import { formatPhoneAsYouType } from "@/lib/format";

type Props = {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
};

export function ContactPhoneField({ id, label, value, onChange, placeholder, required }: Props) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input contact-phone-input"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        placeholder={placeholder ?? "(00) 00000-0000"}
        value={formatPhoneAsYouType(value)}
        required={required}
        onChange={(e) => onChange(formatPhoneAsYouType(e.target.value))}
      />
    </div>
  );
}
