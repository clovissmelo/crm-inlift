/** Contexto de contato/ação na ficha do cliente (relacionado vs oportunidade por produto). */

export type ClientEngagementContext =
  | { kind: "related"; productId: null; opportunityId: null; label: "Contato relacionado" }
  | {
      kind: "opportunity";
      productId: number;
      opportunityId: number;
      productName: string;
      ownerUserId: number | null;
      label: string;
    };

export function formatOpportunityContextLabel(productName: string): string {
  const name = productName.trim();
  return name ? `Oportunidade: ${name}` : "Oportunidade";
}

export function formatEngagementContextLabel(productName: string | null | undefined): string {
  if (!productName?.trim()) return "Contato relacionado";
  return formatOpportunityContextLabel(productName);
}

export function engagementLabelFromContext(ctx: ClientEngagementContext): string {
  return ctx.kind === "related" ? "Contato relacionado" : ctx.label;
}
