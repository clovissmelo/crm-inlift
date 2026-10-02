"use client";

import { FLOW_STEP_CATALOG, type FlowStepKey } from "@/lib/lead-generation/flow-modules";

export type LeadGenFlowPreview = {
  name: string;
  initial_source: string;
  steps: Array<{ step_key: string; label: string; enabled: boolean; on_fail: string; sort_order: number }>;
};

const INITIAL_SOURCE_LABEL: Record<string, string> = {
  anp_retail: "ANP revendedores",
  anp_distributor: "ANP distribuidoras",
  google_places_city: "Google Places (cidade)"
};

function stepTone(key: string): string {
  if (key.startsWith("anp_") || key.includes("discover")) return "source";
  if (key.startsWith("google_")) return "google";
  if (key === "validate_cnpj") return "validate";
  if (key.startsWith("receita")) return "receita";
  if (key === "website_enrich" || key === "instagram_enrich") return "enrich";
  if (key === "create_crm_client") return "create";
  return "default";
}

function stepLabel(key: string, fallback: string): string {
  if (isFlowStepKey(key)) return FLOW_STEP_CATALOG[key].label;
  return fallback;
}

function isFlowStepKey(v: string): v is FlowStepKey {
  return v in FLOW_STEP_CATALOG;
}

type Props = {
  preview: LeadGenFlowPreview;
};

export function LeadGenFlowField({ preview }: Props) {
  const steps = [...preview.steps].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="field lead-gen-flow-field">
      <span className="label">Fluxo de geração</span>
      <div className="lead-gen-flow-field-row">
        <span className="lead-gen-flow-name" title={preview.name}>
          {preview.name}
        </span>
        <span className="lead-gen-flow-help-wrap">
          <button type="button" className="lead-gen-flow-help-btn" aria-label="Ver etapas do fluxo">
            ?
          </button>
          <div className="lead-gen-flow-popover" role="tooltip">
            <p className="lead-gen-flow-popover-head">
              <strong>{preview.name}</strong>
              <span className="lead-gen-flow-popover-source">
                Fonte: {INITIAL_SOURCE_LABEL[preview.initial_source] ?? preview.initial_source}
              </span>
            </p>
            <div className="lead-gen-flow-pipeline" aria-hidden>
              {steps.map((s, i) => (
                <span key={s.step_key} className="lead-gen-flow-pipeline-item">
                  {i > 0 ? <span className="lead-gen-flow-arrow">→</span> : null}
                  <span
                    className={`lead-gen-flow-step lead-gen-flow-step--${stepTone(s.step_key)}`}
                    title={s.on_fail === "stop" ? "Falha interrompe o item" : "Falha continua"}
                  >
                    {stepLabel(s.step_key, s.label)}
                    {s.on_fail === "stop" ? <span className="lead-gen-flow-step-stop">stop</span> : null}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </span>
      </div>
    </div>
  );
}
