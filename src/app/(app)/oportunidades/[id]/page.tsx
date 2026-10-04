import { getOpportunityDetail } from "@/lib/opportunity-pipeline";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Rotas antigas de oportunidade redirecionam para a ficha do cliente. */
export default async function OportunidadePage({ params }: Params) {
  const { id } = await params;
  const opportunityId = Number(id);
  if (!Number.isFinite(opportunityId)) notFound();
  const detail = await getOpportunityDetail(opportunityId);
  if (!detail) notFound();
  const clientId = Number(detail.opportunity.client_id);
  if (!Number.isFinite(clientId)) notFound();
  redirect(`/clientes/${clientId}`);
}
