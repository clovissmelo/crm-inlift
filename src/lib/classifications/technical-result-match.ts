import type { CallHangupSignals } from "@/lib/api4com/infer-approach-result";

export type TechnicalResultTypeRow = {
  id: number;
  slug: string;
  display_name: string;
  provider_rules: unknown;
  sort_order: number;
  status: string;
  answered?: boolean;
};

type ProviderRule = {
  kind?: string;
  codes?: string[];
  labels?: string[];
  unanswered_only?: boolean;
};

function norm(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  return raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function haystack(input: CallHangupSignals): string {
  return [norm(input.hangup_cause_label), norm(input.hangup_cause_code)].filter(Boolean).join(" ");
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((n) => text.includes(norm(n)));
}

export function matchTechnicalResultFromCatalog(
  types: TechnicalResultTypeRow[],
  input: CallHangupSignals
): TechnicalResultTypeRow | null {
  const answered = Boolean(input.answered_at?.trim());
  const text = haystack(input);
  const code = norm(input.hangup_cause_code);

  if (answered) {
    const answeredType = types.find((t) => t.slug === "answered");
    if (answeredType) return answeredType;
  }

  for (const row of types) {
    if (row.slug === "answered") continue;
    const rules = Array.isArray(row.provider_rules) ? (row.provider_rules as ProviderRule[]) : [];
    for (const rule of rules) {
      if (rule.kind === "answered") continue;
      if (rule.unanswered_only && answered) continue;
      if (rule.codes?.some((c) => code === norm(String(c)))) return row;
      if (rule.labels?.length && includesAny(text, rule.labels)) return row;
    }
  }

  if (!answered && text) {
    return types.find((t) => t.slug === "call_failed") ?? null;
  }
  return null;
}

export function suggestedContactSlugForTechnical(technicalSlug: string | null): string | null {
  if (!technicalSlug || technicalSlug === "answered") return null;
  return "nenhum_contato";
}

export function suggestedCommercialSlugForTechnical(technicalSlug: string | null): string | null {
  if (!technicalSlug || technicalSlug === "answered") return null;
  return "sem_contato";
}

export function suggestedCommercialSlugForContact(contactSlug: string | null): string | null {
  if (contactSlug === "nenhum_contato") return "sem_contato";
  return null;
}

export function requiresContactSelection(technicalSlug: string | null): boolean {
  return technicalSlug === "answered";
}
