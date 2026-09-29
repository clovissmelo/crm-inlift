import { GOOGLE_PLACES_BIAS_RADIUS_M } from "@/lib/lead-motor/motor-config";
import { placesGetDetails, placesSearchText } from "@/lib/lead-motor/places-api-new";
import { safeStr, normalizePhoneDigits } from "@/lib/lead-motor/utils";
import type { AnpStation } from "@/lib/lead-motor/anp";

export type GooglePlaceSnapshot = {
  place_id: string;
  name: string;
  formatted_address: string;
  phone_display: string;
  phone_digits: string;
  website: string;
};

const SEARCH_FIELD_MASK = "places.id,places.displayName,places.formattedAddress";
const DETAILS_FIELD_MASK = "id,displayName,formattedAddress,nationalPhoneNumber,websiteUri";

export function buildGoogleSearchQuery(station: AnpStation): string {
  const parts = [
    station.nome_fantasia,
    station.razao_social,
    station.endereco || station.logradouro,
    station.bairro,
    station.cidade,
    station.uf,
    "posto combustivel"
  ];
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const p of parts) {
    const t = safeStr(p);
    const k = t.toLowerCase();
    if (t && !seen.has(k)) {
      seen.add(k);
      cleaned.push(t);
    }
  }
  return cleaned.join(", ");
}

export async function findPlaceId(
  apiKey: string,
  query: string,
  station: AnpStation
): Promise<{ place_id: string; name: string; formatted_address: string } | null> {
  const lat = parseFloat(station.latitude.replace(",", "."));
  const lng = parseFloat(station.longitude.replace(",", "."));
  const locationBias =
    Number.isFinite(lat) && Number.isFinite(lng)
      ? { latitude: lat, longitude: lng, radiusM: GOOGLE_PLACES_BIAS_RADIUS_M }
      : undefined;

  const result = await placesSearchText(apiKey, {
    textQuery: query,
    languageCode: "pt-BR",
    locationBias,
    fieldMask: SEARCH_FIELD_MASK
  });

  if (!result.ok) return null;
  const top = result.data.places[0];
  if (!top?.id) return null;
  return {
    place_id: top.id,
    name: top.name,
    formatted_address: top.formattedAddress
  };
}

export async function getPlaceDetails(apiKey: string, placeId: string): Promise<GooglePlaceSnapshot | null> {
  const result = await placesGetDetails(apiKey, placeId, DETAILS_FIELD_MASK);
  if (!result.ok) return null;
  const row = result.data;
  return {
    place_id: row.id || placeId,
    name: row.name,
    formatted_address: row.formattedAddress,
    phone_display: row.phoneDisplay,
    phone_digits: normalizePhoneDigits(row.phoneDisplay),
    website: row.website
  };
}
