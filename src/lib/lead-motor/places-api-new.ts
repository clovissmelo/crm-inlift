import { GOOGLE_PLACES_MIN_INTERVAL_MS } from "@/lib/lead-motor/motor-config";
import { safeStr } from "@/lib/lead-motor/utils";

const PLACES_BASE = "https://places.googleapis.com/v1";

export type PlacesApiErrorKind =
  | "invalid_key"
  | "api_disabled"
  | "billing"
  | "quota"
  | "legacy_api"
  | "unknown";

export type PlacesApiResult<T> =
  | { ok: true; data: T; httpStatus: number }
  | { ok: false; httpStatus: number; message: string; kind: PlacesApiErrorKind };

let lastGoogleRequestAt = 0;

async function throttleGoogle() {
  const elapsed = Date.now() - lastGoogleRequestAt;
  if (elapsed < GOOGLE_PLACES_MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, GOOGLE_PLACES_MIN_INTERVAL_MS - elapsed));
  }
  lastGoogleRequestAt = Date.now();
}

function displayNameText(row: Record<string, unknown>): string {
  const dn = row.displayName;
  if (dn && typeof dn === "object" && "text" in dn) return safeStr((dn as { text?: string }).text);
  return safeStr(dn);
}

export function classifyPlacesApiError(httpStatus: number, message: string): PlacesApiErrorKind {
  const m = message.toLowerCase();
  if (m.includes("legacy api") || m.includes("not enabled for your project")) return "legacy_api";
  if (httpStatus === 401 || m.includes("api key not valid") || m.includes("invalid api key")) return "invalid_key";
  if (m.includes("billing") || m.includes("enable billing")) return "billing";
  if (httpStatus === 429 || m.includes("quota") || m.includes("resource exhausted")) return "quota";
  if (httpStatus === 403 && (m.includes("places.googleapis.com") || m.includes("has not been used") || m.includes("disabled"))) {
    return "api_disabled";
  }
  if (httpStatus === 403) return "api_disabled";
  return "unknown";
}

export function humanizePlacesApiError(kind: PlacesApiErrorKind, raw: string): string {
  switch (kind) {
    case "invalid_key":
      return "Chave de API inválida. Confira a chave em Integrações → Google Places.";
    case "api_disabled":
      return "Places API (New) não está ativa neste projeto Google Cloud. Ative “Places API (New)” no console.";
    case "legacy_api":
      return "Este projeto ainda aponta para a API legada. Use apenas Places API (New) — a integração do CRM já foi migrada.";
    case "billing":
      return "Faturamento não habilitado no Google Cloud. Ative billing para usar Places API (New).";
    case "quota":
      return "Cota ou limite de requisições excedido. Aguarde ou revise limites no Google Cloud.";
    default:
      return raw || "Erro desconhecido na Places API (New).";
  }
}

async function parseErrorResponse(res: Response): Promise<{ message: string; kind: PlacesApiErrorKind }> {
  let message = res.statusText;
  try {
    const body = (await res.json()) as { error?: { message?: string; status?: string } };
    message = body.error?.message ?? message;
  } catch {
    /* ignore */
  }
  const kind = classifyPlacesApiError(res.status, message);
  return { message: humanizePlacesApiError(kind, message), kind };
}

/** POST places:searchText — Places API (New) */
export async function placesSearchText(
  apiKey: string,
  input: {
    textQuery: string;
    languageCode?: string;
    locationBias?: { latitude: number; longitude: number; radiusM: number };
    fieldMask: string;
  }
): Promise<
  PlacesApiResult<{
    places: Array<{ id: string; name: string; formattedAddress: string }>;
  }>
> {
  await throttleGoogle();
  const body: Record<string, unknown> = {
    textQuery: input.textQuery,
    languageCode: input.languageCode ?? "pt-BR"
  };
  if (input.locationBias) {
    body.locationBias = {
      circle: {
        center: { latitude: input.locationBias.latitude, longitude: input.locationBias.longitude },
        radius: input.locationBias.radiusM
      }
    };
  }

  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": input.fieldMask
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000)
  });

  if (!res.ok) {
    const err = await parseErrorResponse(res);
    return { ok: false, httpStatus: res.status, message: err.message, kind: err.kind };
  }

  const payload = (await res.json()) as { places?: Record<string, unknown>[] };
  const places = (payload.places ?? []).map((p) => ({
    id: safeStr(p.id) || placeIdFromResourceName(safeStr(p.name)),
    name: displayNameText(p),
    formattedAddress: safeStr(p.formattedAddress)
  }));
  return { ok: true, data: { places }, httpStatus: res.status };
}

function placeIdFromResourceName(name: string): string {
  const m = name.match(/^places\/(.+)$/);
  return m ? m[1]! : name;
}

function normalizePlaceIdForUrl(placeId: string): string {
  const id = placeIdFromResourceName(placeId.trim());
  return encodeURIComponent(id);
}

/** GET places/{placeId} — Places API (New) */
export async function placesGetDetails(
  apiKey: string,
  placeId: string,
  fieldMask: string
): Promise<
  PlacesApiResult<{
    id: string;
    name: string;
    formattedAddress: string;
    phoneDisplay: string;
    website: string;
  }>
> {
  await throttleGoogle();
  const id = normalizePlaceIdForUrl(placeId);
  const res = await fetch(`${PLACES_BASE}/places/${id}`, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask
    },
    signal: AbortSignal.timeout(25000)
  });

  if (!res.ok) {
    const err = await parseErrorResponse(res);
    return { ok: false, httpStatus: res.status, message: err.message, kind: err.kind };
  }

  const row = (await res.json()) as Record<string, unknown>;
  const phoneDisplay = safeStr(row.nationalPhoneNumber) || safeStr(row.internationalPhoneNumber);
  return {
    ok: true,
    httpStatus: res.status,
    data: {
      id: safeStr(row.id) || placeIdFromResourceName(safeStr(row.name)) || placeId,
      name: displayNameText(row),
      formattedAddress: safeStr(row.formattedAddress),
      phoneDisplay,
      website: safeStr(row.websiteUri)
    }
  };
}

/** Teste barato: uma searchText com máscara mínima. */
export async function placesTestConnection(apiKey: string) {
  return placesSearchText(apiKey, {
    textQuery: "Agência Nacional do Petróleo Brasília",
    fieldMask: "places.id"
  });
}
