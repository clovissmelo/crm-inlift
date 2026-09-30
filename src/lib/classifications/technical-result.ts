import { all, get } from "@/lib/db";
import type { CallHangupSignals } from "@/lib/api4com/infer-approach-result";
import {
  matchTechnicalResultFromCatalog,
  type TechnicalResultTypeRow,
  suggestedCommercialSlugForContact,
  suggestedCommercialSlugForTechnical,
  suggestedContactSlugForTechnical,
  requiresContactSelection
} from "@/lib/classifications/technical-result-match";

export type { TechnicalResultTypeRow };
export {
  matchTechnicalResultFromCatalog,
  suggestedContactSlugForTechnical,
  suggestedCommercialSlugForTechnical,
  suggestedCommercialSlugForContact,
  requiresContactSelection
};

export async function listActiveTechnicalResultTypes(): Promise<TechnicalResultTypeRow[]> {
  return all<TechnicalResultTypeRow>(
    `
      SELECT id, slug, display_name, provider_rules, sort_order, status, answered
      FROM call_technical_result_types
      WHERE status = 'active'
      ORDER BY sort_order, id
    `
  );
}

export async function resolveTechnicalResultForCall(input: CallHangupSignals): Promise<TechnicalResultTypeRow | null> {
  const types = await listActiveTechnicalResultTypes();
  if (types.length === 0) return null;
  return matchTechnicalResultFromCatalog(types, input);
}

export async function getTechnicalResultTypeById(id: number) {
  return get<TechnicalResultTypeRow>(
    "SELECT id, slug, display_name, provider_rules, sort_order, status, answered FROM call_technical_result_types WHERE id = @id",
    { id }
  );
}

