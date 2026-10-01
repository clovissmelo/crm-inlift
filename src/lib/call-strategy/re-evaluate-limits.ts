import { all } from "@/lib/db";
import { listResultRegistrationAssociations } from "@/lib/classifications/result-associations";
import { getGlobalLimitForKind, readCountForKind } from "@/lib/call-strategy/phone-counters";
import type { OccurrenceKind } from "@/lib/call-strategy/occurrence-policy-shared";

export type ReEvalPreview = {
  phones_total: number;
  would_exhaust: number;
  would_flag_review: number;
  samples: Array<{ client_phone_id: number; client_id: number; kind: string; count: number; limit: number }>;
};

/** Prévia: quantos telefones passariam a esgotar/revisão se limites atuais fossem reavaliados agora (sem alterar fila). */
export async function previewReEvaluateDialLimits(): Promise<ReEvalPreview> {
  const associations = await listResultRegistrationAssociations({ status: "active" });
  const limitsByKind: Partial<Record<OccurrenceKind, number>> = {};
  for (const a of associations) {
    if (!a.dial_counts_for_exhaustion || !a.dial_occurrence_kind) continue;
    const kind = a.dial_occurrence_kind as OccurrenceKind;
    const lim = a.dial_occurrence_limit ?? (await getGlobalLimitForKind(kind));
    limitsByKind[kind] =
      limitsByKind[kind] != null ? Math.min(limitsByKind[kind]!, lim) : lim;
  }

  const rows = await all<{
    client_phone_id: number;
    client_id: number;
    cycle_no_answer_count: number;
    cycle_invalid_count: number;
    cycle_wrong_number_count: number;
    status: string;
  }>(
    `
      SELECT cp.id AS client_phone_id, cp.client_id,
        COALESCE(st.cycle_no_answer_count, 0) AS cycle_no_answer_count,
        COALESCE(st.cycle_invalid_count, 0) AS cycle_invalid_count,
        COALESCE(st.cycle_wrong_number_count, 0) AS cycle_wrong_number_count,
        COALESCE(st.status, 'available') AS status
      FROM client_phones cp
      LEFT JOIN client_phone_dial_state st ON st.client_phone_id = cp.id
      WHERE COALESCE(st.status, 'available') <> 'exhausted'
    `
  );

  let wouldExhaust = 0;
  let wouldReview = 0;
  const samples: ReEvalPreview["samples"] = [];

  for (const row of rows) {
    for (const kind of ["no_answer", "invalid", "wrong_number"] as OccurrenceKind[]) {
      const limit = limitsByKind[kind] ?? (await getGlobalLimitForKind(kind));
      const count = readCountForKind(row, kind);
      if (count >= limit && limit > 0) {
        wouldExhaust += 1;
        if (samples.length < 20) {
          samples.push({
            client_phone_id: row.client_phone_id,
            client_id: row.client_id,
            kind,
            count,
            limit
          });
        }
      }
    }
  }

  return {
    phones_total: rows.length,
    would_exhaust: wouldExhaust,
    would_flag_review: wouldReview,
    samples
  };
}
