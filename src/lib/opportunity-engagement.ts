import { nowIso, run } from "@/lib/db";

export type OpenOpportunityEngagement = "active" | "inactive";

export async function setOpenOpportunityEngagementForProduct(
  clientId: number,
  productId: number,
  engagementStatus: OpenOpportunityEngagement
): Promise<void> {
  await run(
    `
      UPDATE opportunities SET
        engagement_status = @status,
        updated_at = @now,
        row_version = row_version + 1
      WHERE client_id = @clientId AND product_id = @productId AND outcome = 'open'
    `,
    { clientId, productId, status: engagementStatus, now: nowIso() }
  );
}

export async function deactivateOpenOpportunitiesForProduct(clientId: number, productId: number): Promise<void> {
  await setOpenOpportunityEngagementForProduct(clientId, productId, "inactive");
}

export async function reactivateOpenOpportunitiesForProduct(clientId: number, productId: number): Promise<void> {
  await setOpenOpportunityEngagementForProduct(clientId, productId, "active");
}
