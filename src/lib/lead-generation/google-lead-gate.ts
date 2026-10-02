import { normalizePhoneDigits } from "@/lib/lead-motor/utils";

export type GoogleSnapContactFields = {
  phone_digits?: string;
  website?: string;
} | null;

function websiteTrimmed(website: string | undefined): string {
  return (website ?? "").trim();
}

/** Instagram costuma vir no Google como websiteUri apontando para instagram.com. */
export function googleWebsiteIsInstagram(website: string | undefined): boolean {
  const w = websiteTrimmed(website).toLowerCase();
  if (!w) return false;
  return /instagram\.com/i.test(w);
}

/** Pelo menos um sinal de contato vindo dos detalhes Google (Places). */
export function googleHasLeadContactSignals(google: GoogleSnapContactFields): boolean {
  if (!google) return false;
  const phone = normalizePhoneDigits(google.phone_digits ?? "");
  if (phone.length >= 10) return true;
  const website = websiteTrimmed(google.website);
  if (!website) return false;
  return true;
}

export const GOOGLE_CONTACT_SKIP_MESSAGE =
  "Google sem telefone, site ou Instagram — lead não criado";
