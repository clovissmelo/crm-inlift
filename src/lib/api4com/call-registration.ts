/** Indica se a ligação exige complemento comercial manual (atendida). */
export function callRequiresComplementRegistration(input: {
  answered_at?: string | null;
  technical_slug?: string | null;
  duration_seconds?: number | null;
}): boolean {
  if (input.answered_at) return true;
  const slug = input.technical_slug;
  if (slug === "answered") return true;
  if (slug === "no_answer" || slug === "busy" || slug === "invalid_number" || slug === "call_failed") {
    return false;
  }
  return (input.duration_seconds ?? 0) > 0;
}
