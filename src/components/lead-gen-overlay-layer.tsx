"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

export const LEAD_GEN_OVERLAY_ROOT_ID = "app-main-overlay-root";

/**
 * Modais de geração de leads ficam só sobre `.page-content`, não sobre a sidebar —
 * o menu lateral continua navegável com overlay aberto.
 */
export function LeadGenOverlayLayer({ children }: { children: React.ReactNode }) {
  const [root, setRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setRoot(document.getElementById(LEAD_GEN_OVERLAY_ROOT_ID) as HTMLElement | null);
  }, []);

  if (!root) return null;
  return createPortal(children, root);
}
