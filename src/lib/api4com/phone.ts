import { phoneDigits } from "@/lib/format";

/** Formato esperado pela API4COM (apenas dígitos; inclui 55 quando aplicável). */
export function normalizeApi4comCalledNumber(raw: string): string | null {
  const d = phoneDigits(raw);
  if (!d) return null;
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if (d.length >= 12) return d;
  return null;
}

export function normalizeApi4comExtension(raw: string): string | null {
  const ext = raw.trim();
  if (!ext) return null;
  if (!/^[0-9A-Za-z_-]{2,12}$/.test(ext)) return null;
  return ext;
}
