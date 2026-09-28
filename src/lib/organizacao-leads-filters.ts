import type { ClientFilters } from "@/lib/clients-query";

/** Converte query string da tela Organizar leads em filtros de clientes. */
export function clientFiltersFromOrganizacaoParams(
  raw: Record<string, string | undefined>
): ClientFilters {
  const bdrRaw = raw.bdr_user_id?.trim();
  const productRaw = raw.product_id?.trim();
  return {
    city: raw.city?.trim() || undefined,
    uf: raw.uf?.trim() || undefined,
    segment: raw.segment?.trim() || undefined,
    product_id:
      productRaw === "none" ? "none" : productRaw ? Number(productRaw) : undefined,
    bdr_user_id: bdrRaw === "none" ? "none" : bdrRaw ? Number(bdrRaw) : undefined,
    phone_availability: (raw.phone_availability ?? "") as ClientFilters["phone_availability"],
    phone_contacted:
      raw.phone_contacted === "yes" || raw.phone_contacted === "no" || raw.phone_contacted === ""
        ? (raw.phone_contacted as ClientFilters["phone_contacted"])
        : undefined,
    created_from: raw.created_from?.trim() || undefined,
    created_to: raw.created_to?.trim() || undefined,
    search: raw.search?.trim() || undefined,
    limit: raw.limit ? Number(raw.limit) : undefined,
    offset: raw.offset ? Number(raw.offset) : undefined
  };
}

export function organizacaoFiltersToRecord(filters: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v !== "") out[k] = v;
  }
  return out;
}
