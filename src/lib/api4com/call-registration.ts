const UNANSWERED_TECHNICAL_SLUGS = new Set(["no_answer", "busy", "invalid_number", "call_failed"]);

/** Indica se a ligação exige complemento comercial manual (atendida). */
export function callRequiresComplementRegistration(input: {
  answered_at?: string | null;
  technical_slug?: string | null;
  duration_seconds?: number | null;
}): boolean {
  const slug = input.technical_slug?.trim() || null;
  if (slug && UNANSWERED_TECHNICAL_SLUGS.has(slug)) return false;
  if (slug === "answered") return true;
  if (input.answered_at) return true;
  return (input.duration_seconds ?? 0) > 0;
}

/** Exibição em “Atendeu?” — alinhada ao resultado técnico da ligação. */
export function callTelephonyWasAnswered(input: {
  answered_at?: string | null;
  technical_slug?: string | null;
  duration_seconds?: number | null;
}): boolean {
  return callRequiresComplementRegistration(input);
}

/** Rótulo amigável do resultado técnico (telefonia) na UI de registro. */
export function callTelephonyResultLabel(
  technicalSlug: string | null | undefined,
  displayName?: string | null
): string {
  const slug = technicalSlug?.trim() || null;
  if (slug === "no_answer") return "Chamou e não atendeu";
  const name = displayName?.trim();
  if (name) return name;
  if (slug === "answered") return "Atendeu";
  if (slug === "busy") return "Ocupado";
  if (slug === "invalid_number") return "Número inválido";
  if (slug === "call_failed") return "Falha na ligação";
  return "Aguardando telefonia";
}
