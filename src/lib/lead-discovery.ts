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
  /** Rótulo gravado em contacts.origin ao importar o telefone do lead */
  contact_origin?: string | null;
};

export type LeadDiscoveryResult = {
  status: "stub" | "completed" | "failed";
  message: string;
  discovered: DiscoveredLead[];
  skipped_existing: number;
  inserted: number;
};

export type ReconsultApplyOp =
  | { op: "set_client"; field: string; value: string }
  | { op: "set_client_bool"; field: "anp_white_flag"; value: boolean }
  | {
      op: "add_contact";
      name: string;
      phone: string | null;
      job_title: string | null;
      origin: string;
    };

export type ReconsultFieldChange = {
  key: string;
  field: string;
  label: string;
  current: string | null;
  incoming: string | null;
  kind: "new" | "replace";
  origin: string | null;
  apply: ReconsultApplyOp | null;
};

export type ReconsultPreview = {
  status: "stub" | "ready" | "failed";
  message: string;
  changes: ReconsultFieldChange[];
  flow_label: string | null;
  product_name: string | null;
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

export { previewClientReconsult } from "@/lib/client-motor-reconsult";

export { normalizeKey };
