import {
  GOOGLE_PLACES_BIAS_RADIUS_M,
  GOOGLE_PLACES_DETAILS_URL,
  GOOGLE_PLACES_FIND_URL,
  GOOGLE_PLACES_MIN_INTERVAL_MS
} from "@/lib/lead-motor/motor-config";
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

let lastGoogleRequestAt = 0;

async function throttleGoogle() {
  const elapsed = Date.now() - lastGoogleRequestAt;
  if (elapsed < GOOGLE_PLACES_MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, GOOGLE_PLACES_MIN_INTERVAL_MS - elapsed));
  }
  lastGoogleRequestAt = Date.now();
}

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

async function googleGetJson(
  url: string,
  params: Record<string, string>,
  apiKey: string
): Promise<Record<string, unknown> | null> {
  await throttleGoogle();
  const qs = new URLSearchParams({ ...params, key: apiKey });
  const res = await fetch(`${url}?${qs}`, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) return { _error: String(res.status) };
  const payload = (await res.json()) as Record<string, unknown>;
  const status = safeStr(payload.status);
  if (status && status !== "OK" && status !== "ZERO_RESULTS") {
    return { _error: status, _message: safeStr(payload.error_message) };
  }
  return payload;
}

export async function findPlaceId(
  apiKey: string,
  query: string,
  station: AnpStation
): Promise<{ place_id: string; name: string; formatted_address: string } | null> {
  const params: Record<string, string> = {
    input: query,
    inputtype: "textquery",
    fields: "place_id,name,formatted_address",
    language: "pt-BR"
  };
  const lat = parseFloat(station.latitude.replace(",", "."));
  const lng = parseFloat(station.longitude.replace(",", "."));
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    params.locationbias = `circle:${GOOGLE_PLACES_BIAS_RADIUS_M}@${lat},${lng}`;
  }
  const payload = await googleGetJson(GOOGLE_PLACES_FIND_URL, params, apiKey);
  if (!payload || payload._error) return null;
  const candidates = (payload.candidates as Record<string, unknown>[]) ?? [];
  const top = candidates[0];
  if (!top) return null;
  const place_id = safeStr(top.place_id);
  if (!place_id) return null;
  return {
    place_id,
    name: safeStr(top.name),
    formatted_address: safeStr(top.formatted_address)
  };
}

export async function getPlaceDetails(apiKey: string, placeId: string): Promise<GooglePlaceSnapshot | null> {
  const payload = await googleGetJson(
    GOOGLE_PLACES_DETAILS_URL,
    { place_id: placeId, fields: "place_id,name,formatted_phone_number,website,formatted_address", language: "pt-BR" },
    apiKey
  );
  if (!payload || payload._error) return null;
  const row = (payload.result as Record<string, unknown>) ?? {};
  const phoneRaw = safeStr(row.formatted_phone_number);
  return {
    place_id: safeStr(row.place_id) || placeId,
    name: safeStr(row.name),
    formatted_address: safeStr(row.formatted_address),
    phone_display: phoneRaw,
    phone_digits: normalizePhoneDigits(phoneRaw),
    website: safeStr(row.website)
  };
}
