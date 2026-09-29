import type { LeadGenSegmentFilter } from "@/lib/lead-motor/motor-config";

export type LeadGenFilters = {
  cities: string[];
  /** IDs de região (anp-regions) selecionados na UI */
  regions?: string[];
  all_cities_in_uf: boolean;
  segment: LeadGenSegmentFilter;
};

export type LeadGenCounts = {
  anp_found: number;
  items_total: number;
  processed: number;
  google_matched: number;
  enriched: number;
  existing: number;
  created: number;
  no_google_match: number;
  ambiguous: number;
  errors: number;
  skipped_invalid_cnpj: number;
  cities_loaded: number;
  cities_total: number;
};

export function emptyCounts(): LeadGenCounts {
  return {
    anp_found: 0,
    items_total: 0,
    processed: 0,
    google_matched: 0,
    enriched: 0,
    existing: 0,
    created: 0,
    no_google_match: 0,
    ambiguous: 0,
    errors: 0,
    skipped_invalid_cnpj: 0,
    cities_loaded: 0,
    cities_total: 0
  };
}

export type LeadGenerationRunRow = {
  id: number;
  requested_by_user_id: number;
  status: string;
  phase: string;
  uf: string;
  filters_json: LeadGenFilters;
  product_id: number | null;
  company_id: number | null;
  bdr_user_id: number | null;
  max_stations: number;
  max_google_calls: number;
  google_calls_used: number;
  simulation: boolean;
  counts_json: LeadGenCounts;
  progress_pct: number;
  error_message: string | null;
  cancel_requested: boolean;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};
