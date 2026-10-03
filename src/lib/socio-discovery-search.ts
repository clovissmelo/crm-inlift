/** Busca assistida (Google) para achar notícias, redes ou contatos do sócio. */
export function buildSocioDiscoverySearchUrl(input: {
  socioName: string;
  companyName: string;
  city?: string | null;
  uf?: string | null;
}): string {
  const name = input.socioName.trim();
  const company = input.companyName.trim();
  const geo = [input.city?.trim(), input.uf?.trim()?.toUpperCase()].filter(Boolean).join(" ");
  const terms = [`"${name}"`, company ? `"${company}"` : "", geo].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(terms)}`;
}

export function isSocioJobTitle(jobTitle: string | null | undefined): boolean {
  const t = jobTitle?.trim().toLowerCase() ?? "";
  return t === "sócio" || t === "socio";
}
