import type { FlowSnapshot } from "@/lib/lead-generation/flows-repo";
import type { LeadGenSegmentFilter } from "@/lib/lead-motor/motor-config";

export type LeadGenMunicipalityRef = {
  ibge_code: number;
  name: string;
  commercial_zone_id?: number | null;
  ibge_immediate_region_id?: number | null;
  ibge_immediate_region_name?: string | null;
};

export type LeadGenFilters = {
  cities: string[];
  /** Municípios selecionados (IBGE) — gravados na execução */
  municipalities?: LeadGenMunicipalityRef[];
  /** IDs de zona comercial (CRM) */
  commercial_zone_ids?: number[];
  /** @deprecated IDs legados anp-regions */
  regions?: string[];
  all_cities_in_uf: boolean;
  /** Slug cadastrado em lead_generation_segments */
  segment: string;
  /** Regra ANP resolvida ao criar a execução */
  segment_filter_kind?: LeadGenSegmentFilter;
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
  distributor_loaded?: number;
  /** Quantas vezes a execução ampliou cidades (região → UF). */
  geo_expansion_level?: number;
  geo_expanded?: boolean;
  /** Controle anti-travamento */
  last_created_count?: number;
  last_processed_count?: number;
  no_progress_ticks?: number;
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
  flow_id: number | null;
  flow_snapshot_json: FlowSnapshot | null;
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
