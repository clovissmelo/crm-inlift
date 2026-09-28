import { normalizeCnpj } from "@/lib/format";

export function safeStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

export function parseAddressNumber(endereco: string): { logradouro: string; numero: string } {
  const t = endereco.trim();
  const m = t.match(/^(.+?)[,\s]+(\d+\S*)$/);
  if (m) return { logradouro: m[1]!.trim(), numero: m[2]!.trim() };
  return { logradouro: t, numero: "" };
}

export function isValidCnpjDigits(cnpj: string): boolean {
  const d = normalizeCnpj(cnpj) ?? "";
  return d.length === 14 && /^\d{14}$/.test(d);
}

export function normalizePhoneDigits(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length >= 10 && d.length <= 13) return d;
  return "";
}
