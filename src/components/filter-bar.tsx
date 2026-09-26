"use client";

import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes, InputHTMLAttributes } from "react";

type FilterSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & {
  label: string;
  className?: string;
  children: ReactNode;
};

export function FilterSelect({ label, className, children, ...selectProps }: FilterSelectProps) {
  return (
    <label className={clsx("filter-chip", className)}>
      <span className="filter-chip-label">{label}</span>
      <span className="filter-chip-value-wrap">
        <select className="filter-chip-select" {...selectProps}>
          {children}
        </select>
        <ChevronDown className="filter-chip-chevron" size={14} aria-hidden />
      </span>
    </label>
  );
}

type FilterInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label: string;
  className?: string;
};

export function FilterInput({ label, className, ...inputProps }: FilterInputProps) {
  return (
    <label className={clsx("filter-chip", "filter-chip-input-wrap", className)}>
      <span className="filter-chip-label">{label}</span>
      <input className="filter-chip-input" {...inputProps} />
    </label>
  );
}

type FilterBarButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  className?: string;
  accent?: boolean;
};

export function FilterBarButton({ className, accent, children, ...buttonProps }: FilterBarButtonProps) {
  return (
    <button type="button" className={clsx("filter-chip-btn", accent && "filter-chip-btn-accent", className)} {...buttonProps}>
      {children}
    </button>
  );
}

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("filters-row", "filters-bar", className)}>{children}</div>;
}
