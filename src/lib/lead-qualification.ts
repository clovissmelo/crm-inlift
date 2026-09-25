export type LeadQualification = "cold" | "warm" | "hot";

export const LEAD_QUALIFICATION_ORDER: LeadQualification[] = ["cold", "warm", "hot"];

export const LEAD_QUALIFICATION_LABELS: Record<LeadQualification, string> = {
  cold: "Frio",
  warm: "Morno",
  hot: "Quente"
};

export const LEAD_QUALIFICATION_CSS: Record<LeadQualification, string> = {
  cold: "lead-qual-cold",
  warm: "lead-qual-warm",
  hot: "lead-qual-hot"
};

export function parseLeadQualification(value: string | null | undefined): LeadQualification {
  if (value === "warm" || value === "hot") return value;
  return "cold";
}
