/** Helpers de mensagem de cota Google — sem dependências de servidor (safe for client components). */

const GOOGLE_QUOTA_PAUSE_MESSAGES = [
  "Limite diário de consultas Google atingido.",
  "Limite de consultas Google por execução atingido."
] as const;

/** Execução pausada por cota Google (diária ou por execução). */
export function isGoogleQuotaPauseMessage(message: string | null | undefined): boolean {
  const m = message?.trim();
  if (!m) return false;
  if ((GOOGLE_QUOTA_PAUSE_MESSAGES as readonly string[]).includes(m)) return true;
  return /limite di[aá]rio de consultas google/i.test(m) || /limite de consultas google por execu/i.test(m);
}
