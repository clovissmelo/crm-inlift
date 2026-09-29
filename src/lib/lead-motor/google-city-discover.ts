import type { AnpStation } from "@/lib/lead-motor/anp";
import { placesSearchText } from "@/lib/lead-motor/places-api-new";
import { safeStr } from "@/lib/lead-motor/utils";

const SEARCH_FIELD_MASK = "places.id,places.displayName,places.formattedAddress";

export function buildSegmentPlacesQuery(segmentLabel: string, city: string, uf: string): string {
  const base = segmentLabel.trim() || "empresa";
  return `${base} em ${city}, ${uf}, Brasil`;
}

export function placeRowToStation(input: {
  place_id: string;
  name: string;
  formatted_address: string;
  city: string;
  uf: string;
}): AnpStation {
  return {
    cnpj: "",
    razao_social: input.name,
    nome_fantasia: input.name,
    bandeira: "",
    bandeira_branca: false,
    endereco: input.formatted_address,
    logradouro: input.formatted_address,
    numero: "",
    bairro: "",
    cidade: input.city,
    uf: input.uf,
    cep: "",
    autorizacao_anp: "",
    situacao_anp: "",
    distribuidora: "",
    produtos_anp: "",
    latitude: "",
    longitude: "",
    anp_segment: "retail"
  };
}

export async function discoverPlacesInCity(
  apiKey: string,
  query: string,
  maxResults: number
): Promise<Array<{ place_id: string; name: string; formatted_address: string }>> {
  const result = await placesSearchText(apiKey, {
    textQuery: query,
    languageCode: "pt-BR",
    fieldMask: SEARCH_FIELD_MASK
  });
  if (!result.ok) return [];
  const out: Array<{ place_id: string; name: string; formatted_address: string }> = [];
  for (const row of result.data.places) {
    if (!row?.id) continue;
    out.push({
      place_id: row.id,
      name: safeStr(row.name),
      formatted_address: safeStr(row.formattedAddress)
    });
    if (out.length >= maxResults) break;
  }
  return out;
}

/** Chave única por execução quando ainda não há CNPJ. */
export function syntheticItemKey(placeId: string): string {
  return `gplace:${placeId}`;
}
