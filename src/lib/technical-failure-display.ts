const TECHNICAL_PATTERNS =
  /API4COM|api4com|token|ramal|user not registered|Detalhe API4COM|NORMAL_|USER_NOT_REGISTERED|NUMBER_CHANGED|UNALLOCATED|INVALID_NUMBER/i;

export function isTechnicalFailureLog(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.length > 96) return true;
  return TECHNICAL_PATTERNS.test(t);
}

/** Texto curto na ficha; detalhe completo no hover (`title`). */
export function compactTechnicalFailureLabel(text: string): { display: string; fullTitle: string | null } {
  const trimmed = text.trim();
  if (!trimmed) return { display: "—", fullTitle: null };
  if (!isTechnicalFailureLog(trimmed)) return { display: trimmed, fullTitle: null };
  return { display: "Falha técnica", fullTitle: trimmed };
}
