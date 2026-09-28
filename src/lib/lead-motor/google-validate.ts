import { safeStr, stripAccents } from "@/lib/lead-motor/utils";
import type { AnpStation } from "@/lib/lead-motor/anp";

export type GoogleMatchResult = "approved" | "ambiguous" | "rejected";

export function citiesMatch(cadastralCity: string, googleCity: string): boolean {
  const a = stripAccents(safeStr(cadastralCity).toLowerCase());
  const b = stripAccents(safeStr(googleCity).toLowerCase());
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export function nameTokensMatch(station: AnpStation, googleName: string): boolean {
  const base = stripAccents(safeStr(station.razao_social || station.nome_fantasia).toUpperCase());
  const g = stripAccents(safeStr(googleName).toUpperCase());
  if (!base || !g) return false;
  const tokens = base.split(/\s+/).filter((t) => t.length > 3).slice(0, 3);
  if (tokens.length === 0) return true;
  return tokens.some((t) => g.includes(t));
}

export function validateGoogleMatch(
  station: AnpStation,
  googleName: string,
  googleAddress: string
): GoogleMatchResult {
  const cityOk = citiesMatch(station.cidade, extractCityFromAddress(googleAddress) || station.cidade);
  const nameOk = nameTokensMatch(station, googleName);
  if (cityOk && nameOk) return "approved";
  if (!cityOk && !nameOk) return "rejected";
  return "ambiguous";
}

function extractCityFromAddress(formatted: string): string {
  const parts = formatted.split(",").map((p) => p.trim());
  for (const part of parts.reverse()) {
    const m = part.match(/^(.+?)\s*-\s*([A-Z]{2})$/i);
    if (m) return m[1]!.trim();
  }
  return "";
}
