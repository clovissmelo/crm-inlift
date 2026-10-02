/** Metadados de posto (ANP / geração de leads) para exibição no perfil do cliente. */

export type ParsedLeadNotes = {
  leadGenerationRunId: number | null;
  googlePlaceId: string | null;
  anpProductsSummary: string | null;
  /** Texto livre restante após remover linhas de sistema. */
  userNotes: string | null;
};

const ORIGIN_LINE = /^\s*Origem:\s*geração de leads\s*#(\d+)\s*$/i;
const PLACE_LINE = /^\s*Google Place ID:\s*(\S+)\s*$/i;
const PRODUCTS_LINE = /^\s*Produtos ANP:\s*(.+)\s*$/i;

const INLINE_ORIGIN = /Origem:\s*geração de leads\s*#(\d+)/i;
const INLINE_PLACE = /Google Place ID:\s*(\S+)/i;
const INLINE_PRODUCTS = /Produtos ANP:\s*(.+)$/i;

export function parseLeadMotorNotes(notes: string | null | undefined): ParsedLeadNotes {
  const raw = notes?.trim() ?? "";
  if (!raw) {
    return {
      leadGenerationRunId: null,
      googlePlaceId: null,
      anpProductsSummary: null,
      userNotes: null
    };
  }

  let leadGenerationRunId: number | null = null;
  let googlePlaceId: string | null = null;
  let anpProductsSummary: string | null = null;
  const userLines: string[] = [];

  const hasStructuredInline =
    INLINE_ORIGIN.test(raw) || INLINE_PLACE.test(raw) || INLINE_PRODUCTS.test(raw);

  if (hasStructuredInline && !raw.includes("\n")) {
    const origin = raw.match(INLINE_ORIGIN);
    if (origin) leadGenerationRunId = Number(origin[1]);
    const place = raw.match(INLINE_PLACE);
    if (place) googlePlaceId = place[1] ?? null;
    const products = raw.match(INLINE_PRODUCTS);
    if (products) anpProductsSummary = products[1]?.trim() || null;
    return { leadGenerationRunId, googlePlaceId, anpProductsSummary, userNotes: null };
  }

  for (const line of raw.split(/\r?\n/)) {
    const origin = line.match(ORIGIN_LINE);
    if (origin) {
      leadGenerationRunId = Number(origin[1]);
      continue;
    }
    const place = line.match(PLACE_LINE);
    if (place) {
      googlePlaceId = place[1] ?? null;
      continue;
    }
    const products = line.match(PRODUCTS_LINE);
    if (products) {
      anpProductsSummary = products[1]?.trim() || null;
      continue;
    }
    userLines.push(line);
  }

  const userNotes = userLines.join("\n").trim() || null;
  return { leadGenerationRunId, googlePlaceId, anpProductsSummary, userNotes };
}

export type ClientFuelDisplayInput = {
  notes?: string | null;
  lead_generation_run_id?: number | null;
  google_place_id?: string | null;
  anp_fuel_brand?: string | null;
  anp_white_flag?: boolean | null;
  anp_products_summary?: string | null;
};

export type ClientFuelDisplay = {
  fuelBrand: string | null;
  /** Posto bandeirado (rede de bandeira) vs bandeira branca. */
  participatesInBrandNetwork: boolean | null;
  anpProducts: string[];
  leadGenerationRunId: number | null;
  googlePlaceId: string | null;
  userNotes: string | null;
};

export function resolveClientFuelDisplay(input: ClientFuelDisplayInput): ClientFuelDisplay {
  const parsed = parseLeadMotorNotes(input.notes);
  const leadGenerationRunId = input.lead_generation_run_id ?? parsed.leadGenerationRunId;
  const googlePlaceId = input.google_place_id ?? parsed.googlePlaceId;
  const productsRaw = input.anp_products_summary ?? parsed.anpProductsSummary;
  const userNotes = parsed.userNotes;

  const fuelBrand = input.anp_fuel_brand?.trim() || null;
  let participatesInBrandNetwork: boolean | null = null;
  if (input.anp_white_flag === true) participatesInBrandNetwork = false;
  else if (input.anp_white_flag === false) participatesInBrandNetwork = true;

  const anpProducts = productsRaw
    ? productsRaw
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return {
    fuelBrand,
    participatesInBrandNetwork,
    anpProducts,
    leadGenerationRunId,
    googlePlaceId,
    userNotes
  };
}

export function formatParticipatesInBrandNetwork(value: boolean | null): string | null {
  if (value === null) return null;
  return value ? "Sim (posto bandeirado)" : "Não (bandeira branca)";
}
