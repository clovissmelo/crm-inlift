import { createOpportunity, setOpportunityTemperatureById } from "@/lib/opportunity-pipeline";

/** @deprecated Prefer opportunity_id — atualiza a oportunidade aberta mais recente do par cliente/produto */
export async function setOpportunityTemperature(
  clientId: number,
  productId: number,
  userId: number,
  temperature: "cold" | "warm" | "hot" | null
) {
  const { get } = await import("@/lib/db");
  const open = await get<{ id: number }>(
    `
      SELECT id FROM opportunities
      WHERE client_id = @clientId AND product_id = @productId AND outcome = 'open'
      ORDER BY updated_at DESC LIMIT 1
    `,
    { clientId, productId }
  );
  if (open) {
    await setOpportunityTemperatureById(open.id, userId, temperature);
    return;
  }
  await createOpportunity({
    client_id: clientId,
    product_id: productId,
    title: "",
    temperature,
    created_by_user_id: userId
  });
}

export { listClientOpportunityCards as listClientOpportunities } from "@/lib/opportunity-pipeline";
