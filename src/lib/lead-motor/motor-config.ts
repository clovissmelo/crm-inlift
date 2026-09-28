/** Portado de contabilidade-leads-pilot/config.py (PostoCred). */

export const ANP_API_BASE = "https://revendedoresapi.anp.gov.br/v1/combustivel";

export const WHITE_FLAG_DISTRIBUTORS = new Set(["BANDEIRA BRANCA", "SEM BANDEIRA", ""]);

export const GOOGLE_PLACES_FIND_URL = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json";
export const GOOGLE_PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";
export const GOOGLE_PLACES_BIAS_RADIUS_M = 200;
export const GOOGLE_PLACES_MIN_INTERVAL_MS = 250;

export const BRASIL_API_CNPJ = "https://brasilapi.com.br/api/cnpj/v1/{cnpj}";

export const ANP_CITY_SLEEP_MS = 1500;
export const ANP_429_BACKOFF_MS = 8000;
export const REQUEST_TIMEOUT_MS = 25000;

export const ITEMS_PER_CRON_TICK = 3;

export type LeadGenSegmentFilter = "all" | "white_flag_only";
