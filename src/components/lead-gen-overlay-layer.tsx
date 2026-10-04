"use client";

import { useMainOverlayHost } from "@/components/main-overlay-host";
import { createPortal } from "react-dom";

/**
 * Modais de geração de leads ficam só sobre `.page-content`, não sobre a sidebar —
 * o menu lateral continua navegável com overlay aberto.
 */
export function LeadGenOverlayLayer({ children }: { children: React.ReactNode }) {
  const host = useMainOverlayHost();
  if (!host) return null;
  return createPortal(children, host);
}
