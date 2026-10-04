type LeadGenOverlayCloser = () => void;

let closer: LeadGenOverlayCloser | null = null;

export function setLeadGenOverlayCloser(fn: LeadGenOverlayCloser | null) {
  closer = fn;
}

/** Fecha modais de geração de leads antes de trocar de rota (menu lateral). */
export function closeLeadGenOverlays() {
  closer?.();
}
