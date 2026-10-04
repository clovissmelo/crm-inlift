"use client";

import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export function ClientSectionTitle({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return <h3 className={clsx("client-section-title", className)}>{children}</h3>;
}

export function ClientPanelHead({
  title,
  actions,
  collapsible,
  open,
  onToggle
}: {
  title: string;
  actions?: ReactNode;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  if (collapsible) {
    return (
      <div className="client-panel-head client-panel-head--collapsible">
        <button
          type="button"
          className="client-section-collapse-trigger"
          aria-expanded={open}
          onClick={onToggle}
        >
          <ChevronDown
            size={20}
            aria-hidden
            className={clsx("client-section-chevron", open && "client-section-chevron--open")}
          />
          <ClientSectionTitle>{title}</ClientSectionTitle>
        </button>
        {actions ? <div className="client-panel-head-actions">{actions}</div> : null}
      </div>
    );
  }

  return (
    <div className="client-panel-head">
      <ClientSectionTitle>{title}</ClientSectionTitle>
      {actions ? <div className="client-panel-head-actions">{actions}</div> : null}
    </div>
  );
}
