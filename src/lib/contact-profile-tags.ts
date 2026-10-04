import { isSocioJobTitle } from "@/lib/socio-discovery-search";

export function normalizeProfileTagKey(tag: string): string {
  return tag.trim().toLocaleLowerCase("pt-BR");
}

export function parseProfileTagsInput(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;]+/)) {
    const tag = part.trim();
    if (!tag) continue;
    const key = normalizeProfileTagKey(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export function formatProfileTagsForInput(tags: string[] | undefined | null): string {
  return (tags ?? []).join(", ");
}

/** Tags exibidas na ficha (inclui Sócio derivado do cargo quando ainda não está nas tags). */
export function displayContactProfileTags(input: {
  profile_tags?: string[] | null;
  job_title?: string | null;
}): string[] {
  const tags = [...(input.profile_tags ?? [])];
  if (isSocioJobTitle(input.job_title)) {
    const hasSocio = tags.some((t) => normalizeProfileTagKey(t) === "sócio");
    if (!hasSocio) tags.unshift("Sócio");
  }
  return tags;
}

export function pickPrimaryContactRowIndex<T extends { phone: string | null; origin: string }>(rows: T[]): number {
  const withPhone = rows.map((c, i) => ({ c, i })).filter(({ c }) => Boolean(c.phone?.trim()));
  if (!withPhone.length) return -1;
  const google = withPhone.find(({ c }) => c.origin === "Google Places");
  if (google) return google.i;
  const siteGoogle = withPhone.find(({ c }) => c.origin === "Site (Google Places)");
  if (siteGoogle) return siteGoogle.i;
  return withPhone[0]!.i;
}
