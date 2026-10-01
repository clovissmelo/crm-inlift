/** Limpa token colado no perfil (espaços, prefixo Bearer). */
export function normalizeApi4comApiToken(raw: string): string {
  let t = raw.trim();
  if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, "").trim();
  return t.replace(/\s+/g, "");
}
