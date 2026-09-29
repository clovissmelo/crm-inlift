import type { AnpStation } from "@/lib/lead-motor/anp";

export type LeadGenSegmentFilter = "all" | "branded" | "white_flag" | "distributor" | "trr";

/** Valores legados persistidos em execuções antigas */
const LEGACY_SEGMENT_MAP: Record<string, LeadGenSegmentFilter> = {
  white_flag_only: "white_flag"
};

export const LEAD_GEN_SEGMENT_OPTIONS: { value: LeadGenSegmentFilter; label: string }[] = [
  { value: "all", label: "Todos os Postos de Combustível" },
  { value: "branded", label: "Postos de Combustível Bandeirado" },
  { value: "white_flag", label: "Postos de Combustível Bandeira Branca" },
  { value: "distributor", label: "Distribuidoras de Combustível" },
  { value: "trr", label: "TRR — Transportador Revendedor Retalhista" }
];

export function normalizeSegmentFilter(raw: string | undefined | null): LeadGenSegmentFilter {
  if (!raw) return "all";
  const mapped = LEGACY_SEGMENT_MAP[raw] ?? raw;
  if (LEAD_GEN_SEGMENT_OPTIONS.some((o) => o.value === mapped)) {
    return mapped as LeadGenSegmentFilter;
  }
  return "all";
}

export function stationMatchesSegment(station: AnpStation, segment: LeadGenSegmentFilter): boolean {
  switch (segment) {
    case "all":
      return true;
    case "white_flag":
      return station.bandeira_branca;
    case "branded":
      return !station.bandeira_branca;
    case "distributor":
      return (
        station.anp_segment === "distributor" ||
        /\bDISTRIBUIDOR(A)?\b/.test(station.razao_social.toUpperCase()) ||
        /\bDISTRIBUIDOR(A)?\b/.test(station.distribuidora)
      );
    case "trr":
      return (
        station.anp_segment === "trr" ||
        /\bTRR\b/.test(station.razao_social.toUpperCase()) ||
        /TRANSPORTADOR\s+REVENDEDOR\s+RETALHISTA/i.test(station.razao_social)
      );
    default:
      return true;
  }
}
