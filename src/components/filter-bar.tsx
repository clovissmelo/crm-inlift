"use client";

import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes
} from "react";

type FilterOption = { value: string; label: string };

function parseFilterOptions(children: ReactNode): FilterOption[] {
  const options: FilterOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode }>(child)) return;
    if (child.type !== "option") return;
    const value = child.props.value != null ? String(child.props.value) : "";
    const label =
      typeof child.props.children === "string" || typeof child.props.children === "number"
        ? String(child.props.children)
        : value || "—";
    options.push({ value, label });
  });
  return options;
}

type FilterSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & {
  label: string;
  className?: string;
  children: ReactNode;
};

export function FilterSelect({ label, className, children, value, onChange, disabled, name, id }: FilterSelectProps) {
  const autoId = useId();
  const listboxId = id ?? `filter-select-${autoId}`;
  const options = useMemo(() => parseFilterOptions(children), [children]);
  const currentValue = value != null ? String(value) : "";
  const selected = options.find((o) => o.value === currentValue) ?? options[0];
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(nextValue: string) {
    setOpen(false);
    if (nextValue === currentValue) return;
    onChange?.({ target: { value: nextValue, name } } as ChangeEvent<HTMLSelectElement>);
  }

  return (
    <div ref={rootRef} className={clsx("filter-chip", "filter-chip-dropdown-root", className)}>
      <span className="filter-chip-label">{label}</span>
      <div className="filter-chip-value-wrap">
        <button
          type="button"
          className={clsx("filter-chip-trigger", open && "is-open")}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="filter-chip-trigger-value">{selected?.label ?? "—"}</span>
          <ChevronDown className="filter-chip-chevron" size={14} aria-hidden />
        </button>
        {open ? (
          <ul id={listboxId} className="filter-chip-menu" role="listbox" aria-label={label}>
            {options.map((opt) => (
              <li key={`${opt.value}-${opt.label}`} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={opt.value === currentValue}
                  className={clsx("filter-chip-menu-item", opt.value === currentValue && "is-selected")}
                  onClick={() => pick(opt.value)}
                >
                  {opt.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
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
