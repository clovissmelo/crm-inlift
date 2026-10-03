"use client";

import type { TextareaHTMLAttributes } from "react";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows">;

/** Observações no complemento: altura de uma linha, redimensionável verticalmente. */
export function ComplementObservationsTextarea({ className = "", ...props }: Props) {
  return (
    <textarea
      {...props}
      rows={1}
      className={`textarea textarea-compact${className ? ` ${className}` : ""}`}
    />
  );
}
