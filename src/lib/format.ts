export function normalizeCnpj(value: string | null | undefined) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14) return null;
  return digits;
}

export function formatCnpj(digits: string | null | undefined) {
  if (!digits) return "";
  const d = digits.replace(/\D/g, "");
  if (d.length !== 14) return digits;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

export function formatPhoneDisplay(value: string | null | undefined) {
  if (!value) return "";
  const d = value.replace(/\D/g, "");
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  return value;
}

export function phoneDigits(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

/** Celular BR: 11 dígitos começando com 9 após DDD */
export function isMobileBr(digits: string) {
  return digits.length === 11 && digits.charAt(2) === "9";
}

export function whatsAppLink(digits: string) {
  const d = phoneDigits(digits);
  if (!d) return null;
  const withCountry = d.startsWith("55") ? d : `55${d}`;
  return `https://wa.me/${withCountry}`;
}

export function telLink(digits: string) {
  const d = phoneDigits(digits);
  if (!d) return null;
  return `tel:+55${d}`;
}

export function mailtoLink(email: string) {
  const trimmed = email.trim();
  if (!trimmed) return null;
  return `mailto:${trimmed}`;
}

/** Site ou URL genérica para abrir em nova aba */
export function externalWebHref(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/\//, "")}`;
}

/** Instagram: URL completa, link sem protocolo ou @usuario */
export function instagramHref(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/instagram\.com/i.test(trimmed)) return externalWebHref(trimmed);
  const handle = trimmed.replace(/^@/, "").split(/[/?#]/)[0]?.trim();
  if (!handle) return null;
  return `https://www.instagram.com/${handle}`;
}
