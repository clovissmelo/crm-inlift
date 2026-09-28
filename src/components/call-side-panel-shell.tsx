"use client";

import type { ReactNode } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import "./call-script-guide.css";

type Props = {
  title: string;
  meta?: string | null;
  ariaLabel: string;
  collapsed?: boolean;
  collapsedLabel: string;
  onCollapse?: () => void;
  onExpand?: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function CallSidePanelShell({
  title,
  meta,
  ariaLabel,
  collapsed,
  collapsedLabel,
  onCollapse,
  onExpand,
  children,
  footer
}: Props) {
  if (collapsed) {
    return (
      <div className="call-script-collapsed">
        <button type="button" className="btn btn-primary" onClick={onExpand} title={collapsedLabel}>
          <PanelRightOpen size={18} aria-hidden />
          {collapsedLabel}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="call-script-backdrop" aria-hidden />
      <aside className="call-script-panel" aria-label={ariaLabel}>
        <header className="call-script-panel-head">
          <div>
            <h2>{title}</h2>
            {meta ? <p className="call-script-panel-meta">{meta}</p> : null}
          </div>
          <button type="button" className="btn btn-icon-sm" onClick={onCollapse} title="Recolher painel">
            <PanelRightClose size={18} aria-hidden />
          </button>
        </header>
        <div className="call-script-panel-body">{children}</div>
        {footer ? <footer className="call-script-panel-foot">{footer}</footer> : null}
      </aside>
    </>
  );
}
