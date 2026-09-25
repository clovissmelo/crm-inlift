/**
 * Motor de descoberta de leads — integração Google Places (PostoCred / Inlift) virá aqui.
 * Por enquanto retorna stub para validar telas e fluxo de deduplicação.
 */

export type LeadDiscoveryInput = {
  uf: string;
  cities: string[];
  segment: string;
  quantity: number;
};

export type DiscoveredLead = {
  external_key: string;
  trade_name: string;
  legal_name?: string | null;
  cnpj?: string | null;
  city: string;
  uf: string;
  segment: string;
  phone?: string | null;
  website?: string | null;
  instagram?: string | null;
};

export type LeadDiscoveryResult = {
  status: "stub" | "completed" | "failed";
  message: string;
  discovered: DiscoveredLead[];
  skipped_existing: number;
  inserted: number;
};

export type ReconsultFieldChange = {
  field: "phone" | "whatsapp" | "website" | "instagram" | "email" | "address";
  label: string;
  current: string | null;
  incoming: string | null;
  kind: "new" | "replace";
};

export type ReconsultPreview = {
  status: "stub" | "ready";
  message: string;
  changes: ReconsultFieldChange[];
};

function normalizeKey(cnpj: string | null | undefined, name: string, city: string) {
  const c = cnpj?.replace(/\D/g, "");
  if (c && c.length === 14) return `cnpj:${c}`;
  return `name:${name.toLowerCase().trim()}|${city.toLowerCase().trim()}`;
}

/** Stub — substituir por chamada real ao motor (Places / PostoCred). */
export async function runLeadDiscovery(input: LeadDiscoveryInput): Promise<LeadDiscoveryResult> {
  const scope = [input.uf, input.cities.join(", "), input.segment].filter(Boolean).join(" · ");
  return {
    status: "stub",
    message:
      `Motor de busca ainda não conectado (${scope}). Configure as variáveis em Admin e aguarde a integração com Google Places.`,
    discovered: [],
    skipped_existing: 0,
    inserted: 0
  };
}

export async function previewClientReconsult(clientId: number): Promise<ReconsultPreview> {
  void clientId;
  return {
    status: "stub",
    message: "Reconsulta pontual será habilitada quando o motor Google Places estiver ativo.",
    changes: []
  };
}

export { normalizeKey };
