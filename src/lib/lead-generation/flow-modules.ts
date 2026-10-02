/** Módulos de etapa permitidos (sem código arbitrário no cadastro). */

export type FlowStepKey =
  | "anp_retail_list"
  | "anp_distributor_list"
  | "google_places_city_discover"
  | "validate_cnpj"
  | "google_place_search"
  | "google_place_details"
  | "receita_cnpj"
  | "website_enrich"
  | "instagram_enrich"
  | "create_crm_client";

export type FlowInitialSource = "anp_retail" | "anp_distributor" | "google_places_city";

export type FlowStepDefinition = {
  key: FlowStepKey;
  label: string;
  description: string;
  prerequisites: string[];
  phase: "load" | "item";
  usesGoogleQuota?: boolean;
};

export const FLOW_STEP_CATALOG: Record<FlowStepKey, FlowStepDefinition> = {
  anp_retail_list: {
    key: "anp_retail_list",
    label: "ANP — revendedores",
    description: "Lista postos da API pública de revendedores (UF/município).",
    prerequisites: [],
    phase: "load"
  },
  anp_distributor_list: {
    key: "anp_distributor_list",
    label: "ANP — distribuidoras",
    description: "Lista distribuidoras autorizadas (base dedicada, parser próprio).",
    prerequisites: [],
    phase: "load"
  },
  google_places_city_discover: {
    key: "google_places_city_discover",
    label: "Google Places — busca na cidade",
    description: "Descobre estabelecimentos por segmento e município.",
    prerequisites: ["Chave Google Places"],
    phase: "load",
    usesGoogleQuota: true
  },
  validate_cnpj: {
    key: "validate_cnpj",
    label: "Validar CNPJ",
    description: "Valida dígitos e deduplica no CRM.",
    prerequisites: ["CNPJ ou candidato a partir da fonte"],
    phase: "item"
  },
  google_place_search: {
    key: "google_place_search",
    label: "Google — Place ID",
    description: "Busca correspondência do estabelecimento.",
    prerequisites: ["Endereço ou nome"],
    phase: "item",
    usesGoogleQuota: true
  },
  google_place_details: {
    key: "google_place_details",
    label: "Google — detalhes",
    description: "Telefone, site e endereço formatado pelo Place ID.",
    prerequisites: ["Place ID"],
    phase: "item",
    usesGoogleQuota: true
  },
  receita_cnpj: {
    key: "receita_cnpj",
    label: "CNPJ — Receita (Brasil API)",
    description: "Sócios, telefones e nome fantasia.",
    prerequisites: ["CNPJ válido"],
    phase: "item"
  },
  website_enrich: {
    key: "website_enrich",
    label: "Site",
    description: "Varre o site informado pelo Google Places em busca de telefones adicionais.",
    prerequisites: ["Website do Google Places (detalhes)"],
    phase: "item"
  },
  instagram_enrich: {
    key: "instagram_enrich",
    label: "Instagram",
    description: "Busca perfil público quando integração disponível.",
    prerequisites: ["Website ou nome fantasia"],
    phase: "item"
  },
  create_crm_client: {
    key: "create_crm_client",
    label: "Criar lead no CRM",
    description: "Insere cliente novo; nunca sobrescreve existente.",
    prerequisites: ["Dados mínimos de cadastro"],
    phase: "item"
  }
};

export const FLOW_STEP_KEYS = Object.keys(FLOW_STEP_CATALOG) as FlowStepKey[];

export function isFlowStepKey(v: string): v is FlowStepKey {
  return v in FLOW_STEP_CATALOG;
}
