import { phoneDigits } from "@/lib/format";

/** Formato esperado pela API4COM (apenas dígitos; inclui 55 quando aplicável). */
export function normalizeApi4comCalledNumber(raw: string): string | null {
  let d = phoneDigits(raw);
  if (!d) return null;
  while (d.startsWith("55") && d.length > 13) {
    d = d.slice(2);
  }
  if (d.startsWith("55") && d.length >= 12 && d.length <= 13) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if (d.length >= 12 && d.length <= 13) return d.startsWith("55") ? d : null;
  return null;
}

export function normalizeApi4comExtension(raw: string): string | null {
  const ext = raw.trim();
  if (!ext) return null;
  if (!/^[0-9A-Za-z_-]{2,12}$/.test(ext)) return null;
  return ext;
}

/** Dígitos normalizados (ex.: 5511…) → E.164 para POST /calls. */
export function toApi4comCalledE164(normalizedDigits: string): string {
  const d = normalizedDigits.replace(/\D/g, "");
  return d.startsWith("+") ? d : `+${d}`;
}
