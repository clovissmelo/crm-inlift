import { OpportunityDetailView } from "@/components/opportunity-detail-view";
import { loadCatalog } from "@/lib/catalog";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function OportunidadePage({ params }: Params) {
  const { id } = await params;
  const opportunityId = Number(id);
  if (!Number.isFinite(opportunityId)) notFound();
  const { users } = await loadCatalog();
  return <OpportunityDetailView opportunityId={opportunityId} users={users} />;
}
