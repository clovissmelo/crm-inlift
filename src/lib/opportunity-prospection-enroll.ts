import { PROSPECCAO_PIPELINE_STAGE_NAME } from "@/lib/attendance/operational-actions";
import { reenterProspeccaoProduct } from "@/lib/client-product-prospeccao";
import { reactivateOpenOpportunitiesForProduct } from "@/lib/opportunity-engagement";
import {
  closeSupersededOpenOpportunities,
  createOpportunity,
  getDefaultStageId
} from "@/lib/opportunity-pipeline";
import { returnClientToProspeccaoQueue } from "@/lib/prospeccao-return";
export type OpportunityEnrollmentMode = "prospection" | "interested";

/** Cria oportunidade e, no modo prospecção, coloca o par cliente/produto na fila como hoje no motor. */
export async function createProductOpportunityWithEnrollment(input: {
  client_id: number;
  product_id: number;
  title?: string;
  origin_bdr_user_id?: number | null;
  owner_user_id?: number | null;
  created_by_user_id: number;
  enrollment: OpportunityEnrollmentMode;
  close_superseded?: boolean;
}) {
  if (input.close_superseded !== false) {
    await closeSupersededOpenOpportunities(input.client_id, input.product_id, input.created_by_user_id);
  }

  let pipelineStageId: number | null | undefined;
  if (input.enrollment === "prospection") {
    pipelineStageId =
      (await getDefaultStageId(PROSPECCAO_PIPELINE_STAGE_NAME)) ??
      (await getDefaultStageId("Em Prospecção"));
  }

  const opportunityId = await createOpportunity({
    client_id: input.client_id,
    product_id: input.product_id,
    title: input.title ?? "",
    origin_bdr_user_id: input.origin_bdr_user_id,
    owner_user_id: input.owner_user_id,
    pipeline_stage_id: pipelineStageId ?? undefined,
    created_by_user_id: input.created_by_user_id
  });

  if (input.enrollment === "prospection") {
    await reenterProspeccaoProduct(input.client_id, input.product_id);
    await reactivateOpenOpportunitiesForProduct(input.client_id, input.product_id);
    await returnClientToProspeccaoQueue(
      input.client_id,
      input.created_by_user_id,
      input.product_id,
      input.owner_user_id ?? input.origin_bdr_user_id ?? null
    );
  }

  return opportunityId;
}
